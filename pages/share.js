// share.js
import { useRef, useState, useEffect } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';
import styles from '../styles/share.module.css';

import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  push,
  update,
  remove,
  serverTimestamp,
  get,
  onDisconnect,
  onValue
} from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export default function Share() {
  const videoRef = useRef(null);
  const imageRef = useRef(null);

  // Firebase app e RTDB
  const appRef = useRef(null);
  const dbRef = useRef(null);

  // Mapeia viewerId → RTCPeerConnection
  const peers = useRef({});

  // ID do broadcaster atual
  const broadcasterIdRef = useRef(null);

  // Intervalos de ping/pong e timer
  const heartbeatIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Funções de cancelamento de assinatura para os ouvintes do Firebase
  const watchersListenerRef = useRef(null);
  const beforeUnloadListenerRef = useRef(null);

  // Estados para UI
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connections, setConnections] = useState([]);
  const [isWideScreen, setIsWideScreen] = useState(true);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const [links, setLinks] = useState([]);

  const updateConnections = () => {
    const hostEntry = broadcasterIdRef.current
      ? [{ type: 'Host', id: broadcasterIdRef.current }]
      : [];

    const viewerEntries = Object.keys(peers.current).map(id => ({
      type: 'Viewer',
      id
    }));

    setConnections([...hostEntry, ...viewerEntries]);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth > 1500);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isStreaming) {
      heartbeatIntervalRef.current = setInterval(() => {
        const db = dbRef.current;
        if (!db) return;
        const bRef = ref(db, "signaling/broadcaster");
        update(bRef, { lastPing: serverTimestamp() });
        showLog('✉️ Ping (broadcaster → RTDB)');
        checkViewersAlive();
      }, 30000);
    }
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [isStreaming]);

  const checkViewersAlive = async () => {
    const db = dbRef.current;
    if (!db) return;
    const viewersSnap = await get(ref(db, "signaling/viewers"));
    if (!viewersSnap.exists()) return;

    const agora = Date.now();
    const viewers = viewersSnap.val();
    for (const [vid, data] of Object.entries(viewers)) {
      if (!data.lastSeen || agora - data.lastSeen > 40000) {
        showLog(`❌ Viewer ${vid} não respondeu a tempo, removendo`);
        remove(ref(db, `signaling/viewers/${vid}`));
        const entry = peers.current[vid];
        if (entry && entry.pc) entry.pc.close();
        delete peers.current[vid];
      }
    }
    updateConnections();
  };

  const generateBroadcasterId = () => {
    const db = dbRef.current;
    if (!db) return null;
    const pushRef = push(ref(db, "signaling/temp"));
    const key = pushRef.key;
    remove(pushRef);
    return key;
  };

  const disableButtonsTemporarily = () => {
    setButtonsDisabled(true);
    setTimeout(() => setButtonsDisabled(false), 6000);
  };

  // Extrair YouTube ID
  const parseYouTubeId = (input) => {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
    try {
      const url = new URL(trimmed);
      if (url.hostname.includes('youtu.be')) {
        return url.pathname.slice(1);
      }
      if (url.hostname.includes('youtube.com')) {
        if (url.pathname.includes('/live/')) {
          return url.pathname.split('/live/')[1];
        }
        if (url.searchParams && url.searchParams.get('v')) {
          return url.searchParams.get('v');
        }
        const parts = url.pathname.split('/');
        const embedIndex = parts.indexOf('embed');
        if (embedIndex >= 0 && parts[embedIndex + 1]) {
          return parts[embedIndex + 1];
        }
      }
    } catch (e) {
      showLog("Não é uma URL válida");
    }
    const re = /(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9\-_]{11})/;
    const m = trimmed.match(re);
    if (m && m[1]) return m[1];
    return null;
  };

  // Inicializa Firebase
  const initFirebase = () => {
    if (!appRef.current) {
      const app = initializeApp(firebaseConfig);
      appRef.current = app;
      dbRef.current = getDatabase(app);
      showLog('Firebase inicializado');

      // start listening to links
      const linksRef = ref(dbRef.current, 'livestreams/links');
      onValue(linksRef, (snap) => {
        const val = snap.val() || {};
        // Convert to array keeping push order
        const arr = Object.keys(val).map(k => ({ key: k, ...val[k] }));
        setLinks(arr);
      });
    }
  };

  useEffect(() => {
    initFirebase();
    const db = dbRef.current;
    if (!db) return showToast('❌ Erro ao conectar ao RTDB');
  }, []);

  // Iniciar stream
  const startStreaming = async () => {
    if (isStreaming || buttonsDisabled) return;
    disableButtonsTemporarily();
    showLog('🟢 Iniciando fluxo de broadcast ...');

    const db = dbRef.current;

    // Gera broadcasterId e cria nó em RTDB
    const newBroadcasterId = generateBroadcasterId();
    broadcasterIdRef.current = newBroadcasterId;
    const bRef = ref(db, "signaling/broadcaster");

    // remove on disconnect
    onDisconnect(bRef).remove();

    // Verifica se há broadcaster ativo
    const snapshotB = await get(bRef);
    if (snapshotB.exists()) {
      const data = snapshotB.val();
      const STALE_THRESHOLD = 60000;
      const lastPing = data.lastPing || 0;
      if (Date.now() - lastPing <= STALE_THRESHOLD) {
        showToast('🚫 Já existe um broadcaster ativo no momento.');
        broadcasterIdRef.current = null;
        return;
      } else {
        await remove(bRef);
      }
    }

    // Verifica se há links salvos
    const linksSnap = await get(ref(db, 'livestreams/links'));
    if (!linksSnap.exists()) {
      showToast('⏸️ Lista vazia, adicione links no painel lateral antes de iniciar a stream.');
      broadcasterIdRef.current = null;
      return;
    }

    // Escreve nó que indica broadcaster online
    try {
      const liveOnlineRef = ref(db, 'livestreams/online');
      onDisconnect(liveOnlineRef).remove();
      await set(liveOnlineRef, {
        started: true,
        startedAt: serverTimestamp(),
        broadcasterId: newBroadcasterId
      });
      showLog('📡 Lista salva em livestreams/online');
    } catch (e) {
      showToast('❌ Erro ao marcar stream online');
      try { await remove(bRef); } catch (err) { }
      broadcasterIdRef.current = null;
      return;
    }

    // Também cria nó em RTDB com started=true para signaling
    try {
      await set(bRef, {
        id: newBroadcasterId,
        started: true,
        lastPing: serverTimestamp()
      });
      showLog(`🎥 Broadcaster registrado no RTDB com ID=${newBroadcasterId}`);
    } catch (e) {
      showLog('⚠️ Falha ao criar signaling/broadcaster no RTDB:', e);
    }

    // Set thumbnail for first video
    const first = links[0];
    const vid = first ? first.videoId : null;
    const thumb = vid ? `https://img.youtube.com/vi/${vid}/maxresdefault.jpg` : null;
    const fallbackThumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
    if (imageRef.current && fallbackThumb) {
      imageRef.current.src = fallbackThumb;
      setImageLoaded(true);
      // tentativa de carregar maxres (se 404, browser não substitui)
      const img = new Image();
      img.onload = () => {
        // se carregou, troca para maxres
        if (imageRef.current) imageRef.current.src = thumb;
      };
      img.onerror = () => {
        // não faz nada, fica com fallback
      };
      img.src = thumb;
    }

    // Marca estados e inicializa cronômetro
    setIsStreaming(true);
    setStartTime(Date.now());
    setElapsedTime(0);
    const now = Date.now();
    timerIntervalRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - now) / 1000));
    }, 1000);

    updateConnections();
    showToast('📡 Stream iniciada');

    // beforeunload cleanup
    const beforeUnloadHandler = async () => {
      if (dbRef.current) {
        try {
          await remove(ref(dbRef.current, "signaling/broadcaster"));
          await remove(ref(dbRef.current, "livestreams/online"));
        } catch (e) { }
      }
    };
    window.addEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadListenerRef.current = beforeUnloadHandler;
  };

  // Parar stream (limpa RTDB)
  const handleStop = async () => {
    if (!isStreaming || buttonsDisabled) return;
    disableButtonsTemporarily();
    setIsStreaming(false);

    if (startTime) {
      const totalMs = Date.now() - startTime;
      const totalSeconds = Math.floor(totalMs / 1000);
      showToast(`⏹️ Stream encerrada (⏱️ ${formatSeconds(totalSeconds)})`);
    } else {
      showToast('⏹️ Stream encerrada');
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Fecha peerConnections
    for (const [vid, entry] of Object.entries(peers.current)) {
      if (entry.pc) entry.pc.close();
      if (entry.unsubscribeInner) {
        entry.unsubscribeInner();
      }
    }
    peers.current = {};

    // Remove nós no RTDB
    if (dbRef.current) {
      try {
        await remove(ref(dbRef.current, "signaling/broadcaster"));
        await remove(ref(dbRef.current, "messages/broadcasterToViewers"));
        await remove(ref(dbRef.current, "livestreams/online"));
      } catch (e) {
        showLog('⚠️ Erro ao remover nós RTDB:', e);
      }
      if (watchersListenerRef.current) {
        watchersListenerRef.current();
        watchersListenerRef.current = null;
      }
    }

    broadcasterIdRef.current = null;
    setConnections([]);
    setImageLoaded(false);
    setStartTime(null);
    setElapsedTime(0);

    if (beforeUnloadListenerRef.current) {
      window.removeEventListener("beforeunload", beforeUnloadListenerRef.current);
      beforeUnloadListenerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      Object.values(peers.current).forEach(entry => {
        if (entry.pc) entry.pc.close();
        if (entry.unsubscribeInner) entry.unsubscribeInner();
      });
      // Remove listeners de Firebase
      if (watchersListenerRef.current) watchersListenerRef.current();
      if (beforeUnloadListenerRef.current) {
        window.removeEventListener("beforeunload", beforeUnloadListenerRef.current);
      }
    };
  }, []);

  function formatSeconds(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  // Links managers
  const addLink = async () => {
    const db = dbRef.current;

    const candidate = window.prompt('Link ou ID do YouTube:');
    if (!candidate) return;
    const vid = parseYouTubeId(candidate);
    if (!vid) return showToast('❌ Link inválido');

    try {
      const pushRef = push(ref(db, 'livestreams/links'));
      await set(pushRef, {
        url: candidate,
        videoId: vid,
        addedAt: serverTimestamp()
      });
      showToast('✅ Link adicionado');
    } catch (e) {
      showToast('❌ Falha ao adicionar link');
      console.error(e);
    }
  };

  const removeLink = async (key) => {
    showToast("Removendo...")
    initFirebase();
    const db = dbRef.current;

    try {
      await remove(ref(db, `livestreams/links/${key}`));
      showToast('🗑️ Link removido');
    } catch (e) {
      showToast('❌ Falha ao remover link');
      console.error(e);
    }
  };

  return (
    <div className={styles.container}>
      {/* Side Panel */}
      {/* <div className={`${styles.sidePanel} ${isStreaming ? styles.sidePanelActive : ''}`}> */}
      <div className={`${styles.sidePanel} ${true ? styles.sidePanelActive : ''}`}>

        <h2 style={{ marginTop: 0 }}>Links da Playlist</h2>

        <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
          <button onClick={() => addLink()} className={styles.startButton}>➕ Adicionar link</button>
        </div>

        <ul style={{ listStyleType: 'none', padding: 0 }}>
          {links.length === 0 && <li style={{ opacity: 0.7 }}>Nenhum link adicionado</li>}
          {links.map((l, idx) => (
            <li key={l.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <div style={{ display: 'flex' }}>
                <button onClick={() => removeLink(l.key)} title="Remover" className={styles.stopButton} style={{ padding: '0.2rem 0.5rem' }}>🗑️</button>
                <div style={{ flex: 1, fontSize: '0.95rem', paddingLeft: 10 }}>{idx + 1}. {l.url} </div>
              </div>
            </li>
          ))}
        </ul>

        {isStreaming && (
          <>
            <hr />
            <h3>Conexões</h3>
            <ul style={{ listStyleType: 'none', padding: 0 }}>
              {connections.map((conn, index) => (
                <li key={index} style={{ fontSize: '1rem' }}>
                  {conn.type === 'Host' ? '🎥 ' : '👀 '} {conn.type}: {conn.id}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className={`${styles.mainContent} ${isWideScreen ? styles.mainContentShifted : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerTitleWrapper}>
              <h1 className={styles.headerTitle}>C I M E N A</h1>
              <span className={styles.headerSubtitle}>S t u d i o</span>
            </div>
          </div>
        </div>

        {/* Preview Container */}
        <div className={styles.previewContainer}>
          <div className={`${styles.statusBadge} ${isStreaming ? styles.statusBadgeActive : ''}`}>
            <span style={{ textAlign: 'left', display: 'flex' }}>
              {isStreaming ? '🟢 Transmissão ativa' : '🔴 Transmissão parada'}
            </span>
            {isStreaming && (
              <div style={{ marginTop: '0.5rem', marginLeft: '2px' }}>
                ⏱️ Tempo de stream: {formatSeconds(elapsedTime)}
              </div>
            )}
          </div>

          {isStreaming && !imageLoaded && (
            <div className={styles.loadingOverlay}>Iniciando pré-visualização...</div>
          )}

          <img
            ref={imageRef}
            alt="Preview"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: imageLoaded ? 'block' : 'none'
            }}
          />
        </div>

        {/* Controls */}
        <div>
          {isStreaming ? (
            <button
              onClick={handleStop}
              disabled={buttonsDisabled}
              className={styles.stopButton}
            >
              Parar Stream
            </button>
          ) : (
            <button
              onClick={startStreaming}
              disabled={buttonsDisabled}
              className={styles.startButton}
            >
              Iniciar Stream
            </button>
          )}
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
