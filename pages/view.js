// view.js
import { useEffect, useRef, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { showToast, showLog } from '../components/toastUtils';
import WaveText from '../components/waveText';
import styles from '../styles/view.module.css';
const muteImg = '/images/no-sound.png';

import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue
} from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export default function View() {
  const appRef = useRef(null);
  const dbRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // Estados
  const [videoId, setVideoId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);

  // Inicializa RTDB
  const initFirebase = () => {
    if (!appRef.current) {
      const app = initializeApp(firebaseConfig);
      appRef.current = app;
      dbRef.current = getDatabase(app);
      showLog('Firebase inicializado');
    }
  };

  // Extrai YouTube videoId de várias formas de URL ou recebe id diretamente
  const parseYouTubeId = (input) => {
    if (!input) return null;
    // Se já for um ID curto (11 chars)
    const trimmed = input.trim();
    if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

    try {
      // tenta como URL
      // exemplos:
      // https://www.youtube.com/watch?v=VIDEOID
      // https://youtu.be/VIDEOID
      // https://www.youtube.com/embed/VIDEOID
      // https://www.youtube.com/live/VIDEOID

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

    // Última tentativa: extrair com regex de qualquer string
    const re = /(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9\-_]{11})/;
    const m = trimmed.match(re);
    if (m && m[1]) return m[1];

    return null;
  };

  // Monta src do embed com autoplay/mute conforme estado
  const buildEmbedSrc = (vid, muted) => {
    if (!vid) return '';
    const base = `https://www.youtube.com/embed/${vid}`;
    const params = new URLSearchParams({
      autoplay: '1',
      playsinline: '1',
      rel: '0',
      modestbranding: '1',
      controls: '0',
      disablekb: '1',
      mute: muted ? '1' : '0'
    });
    return `${base}?${params.toString()}`;
  };

  // Lê o nó do RTDB que contém a live
  useEffect(() => {
    initFirebase();
    const db = dbRef.current;
    if (!db) return;

    const liveRef = ref(db, 'livestreams/current');

    const unsubscribe = onValue(
      liveRef,
      (snap) => {
        if (!snap.exists()) {
          showLog('📭 Stream não encontrada no RTDB');
          setVideoId(null);
          setIsStreaming(false);
          return;
        }
        const data = snap.val();
        // tenta vários campos: youtubeUrl, url, videoId
        const candidate = data && (data.youtubeUrl || data.url || data.videoId) || null;
        if (!candidate) {
          showLog('📭 Nó presente mas sem campo youtubeUrl/url/videoId');
          setVideoId(null);
          setIsStreaming(false);
          return;
        }

        showLog('📡 Stream encontrada no RTDB:', candidate);
        const vid = parseYouTubeId(candidate);
        if (vid) {
          setVideoId(vid);
          setIsStreaming(true);
          setHasStartedOnce(true);
          showToast('▶️ Stream conectada');
        } else {
          // se não conseguiu extrair, marca como offline/erro
          showLog('❌ Não foi possível extrair videoId do campo.');
          setVideoId(null);
          setIsStreaming(false);
        }
      },
      (err) => {
        showToast('❌ Falha ao buscar os dados:', err);
      }
    );

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler para habilitar áudio: atualiza state que força rebuild da src com mute=0
  const handleEnableAudio = () => {
    setAudioEnabled(true);
    showToast('🔊 Áudio ativado');
  };

  // src do iframe depende de videoId e audioEnabled
  const iframeSrc = videoId ? buildEmbedSrc(videoId, !audioEnabled) : '';

  return (
    <>
      <div className={styles.container}>
        {isStreaming && hasStartedOnce && !audioEnabled && (
          <div className={styles.overlay} onClick={handleEnableAudio}>
            <img src={muteImg} alt="Som desligado" className={styles.muteIcon} />
          </div>
        )}

        {/* iframe do YouTube preenchendo a tela */}
        {videoId ? (
          <iframe
            title="Cimena Livestream"
            src={iframeSrc}
            className={styles.video}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            frameBorder="0"
          />
        ) : (
          // conteúdo quando não há live
          <>
            <div className={styles.poster}>
              <h1 className={styles.heading}>C I M E N A</h1>
              <span className={styles.subHeading}>
                {hasStartedOnce ? <p>Stream encerrada</p> : <WaveText />}
              </span>
            </div>

            <div>
              <svg
                className={styles.waves}
                xmlns="http://www.w3.org/2000/svg"
                xmlnsXlink="http://www.w3.org/1999/xlink"
                viewBox="0 24 150 28"
                preserveAspectRatio="none"
                shapeRendering="auto"
              >
                <defs>
                  <path
                    id="gentle-wave"
                    d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
                  />
                </defs>
                <g className={styles.parallax}>
                  <use xlinkHref="#gentle-wave" x="48" y="0" fill="rgba(90, 197, 241, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="3" fill="rgba(37, 151, 213, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="5" fill="rgba(17, 107, 180, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="7" fill="rgba(21, 71, 139, 1)" />
                </g>
              </svg>
            </div>

            <div className={styles.fill}></div>
          </>
        )}
      </div>

      <ToastContainer />
    </>
  );
}
