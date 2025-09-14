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
  const linksUnsubRef = useRef(null);
  const onlineUnsubRef = useRef(null);

  // Estados
  const [links, setLinks] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const playerRef = useRef(null);
  const currentIndexRef = useRef(0);

  // Inicializa RTDB
  const initFirebase = () => {
    if (!appRef.current) {
      const app = initializeApp(firebaseConfig);
      appRef.current = app;
      dbRef.current = getDatabase(app);
      showLog('Firebase inicializado');
    }
  };

  // Monta src do embed com autoplay/mute conforme estado (fallback - not used when using YT API)
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

  // Use YouTube IFrame API to control playlist sequencing
  const ensureYouTubeAPI = () => {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();
      const existing = document.getElementById('youtube-iframe-api');
      if (existing) {
        existing.onload = () => resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.onload = () => {
        // The API sets window.YT when ready and calls onYouTubeIframeAPIReady; we resolve on that
      };
      document.body.appendChild(script);
      // set global ready callback
      window.onYouTubeIframeAPIReady = () => resolve();
    });
  };

  useEffect(() => {
    initFirebase();
    const db = dbRef.current;
    if (!db) return;

    // Listen to links
    const linksRef = ref(db, 'livestreams/links');
    const linksUnsub = onValue(linksRef, (snap) => {
      const val = snap.val() || {};
      const arr = Object.keys(val).map(k => ({ key: k, ...val[k] }));
      setLinks(arr);
    });
    linksUnsubRef.current = linksUnsub;

    // Listen to online flag
    const onlineRef = ref(db, 'livestreams/online');
    const onlineUnsub = onValue(onlineRef, (snap) => {
      const exists = snap.exists();

      if (!exists) {
        // stopped -> primeiro limpa o player para evitar que a YT API tente manipular o DOM
        setHasStartedOnce(prev => prev || false);

        if (playerRef.current) {
          try {
            if (typeof playerRef.current.destroy === 'function') {
              // método oficial para limpar player e listeners
              playerRef.current.destroy();
            } else if (typeof playerRef.current.stopVideo === 'function') {
              // fallback mínimo
              playerRef.current.stopVideo();
            }
          } catch (e) {
            console.warn('Erro ao limpar YT player:', e);
          }
          playerRef.current = null;
        }

        // agora atualiza o state (isso pode remover o <div id="player">)
        setIsStreaming(false);
      } else {
        // started
        setHasStartedOnce(true);
        setIsStreaming(true);
      }
    });
    onlineUnsubRef.current = onlineUnsub;

    return () => {
      if (linksUnsubRef.current) linksUnsubRef.current();
      if (onlineUnsubRef.current) onlineUnsubRef.current();

      // garante destruir o YT player caso o componente seja desmontado
      if (playerRef.current) {
        try {
          if (typeof playerRef.current.destroy === 'function') {
            playerRef.current.destroy();
          } else if (typeof playerRef.current.stopVideo === 'function') {
            playerRef.current.stopVideo();
          }
        } catch (e) { }
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When links change and streaming is active, (re)initialize or load first video
  useEffect(() => {
    if (!isStreaming || links.length === 0) return;

    (async () => {
      await ensureYouTubeAPI();

      // create player if missing
      if (!playerRef.current) {
        playerRef.current = new window.YT.Player('player', {
          height: '100%',
          width: '100%',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            controls: 0,
            disablekb: 1
          },
          events: {
            onReady: (ev) => {
              // mute by default
              if (!audioEnabled) ev.target.mute();
              // load first
              const first = links[0];
              if (first && first.videoId) {
                currentIndexRef.current = 0;
                try { ev.target.loadVideoById(first.videoId); } catch (e) { ev.target.cueVideoById(first.videoId); }
              }
            },
            onStateChange: (ev) => {
              // YT.PlayerState.ENDED === 0
              if (ev.data === window.YT.PlayerState.ENDED) {
                // advance
                const next = currentIndexRef.current + 1;
                if (next < links.length) {
                  currentIndexRef.current = next;
                  const nextVid = links[next].videoId;
                  try { playerRef.current.loadVideoById(nextVid); } catch (e) { playerRef.current.cueVideoById(nextVid); }
                } else {
                  // playlist finished -> optionally loop or stop
                  // We'll stop and keep poster state
                  showToast('🔚 Playlist finalizada');
                }
              }
            }
          }
        });
      } else {
        // player exists -> load first video
        if (playerRef.current && playerRef.current.loadVideoById) {
          currentIndexRef.current = 0;
          const first = links[0];
          if (first && first.videoId) {
            try { playerRef.current.loadVideoById(first.videoId); } catch (e) { playerRef.current.cueVideoById(first.videoId); }
          }
        }
      }

      // ensure mute state
      if (playerRef.current) {
        if (audioEnabled) {
          if (typeof playerRef.current.unMute === 'function') {
            playerRef.current.unMute();
          } else if (typeof playerRef.current.setVolume === 'function') {
            // fallback: ajustar volume caso API de mute não esteja disponível
            playerRef.current.setVolume(100);
          }
        } else {
          if (typeof playerRef.current.mute === 'function') {
            playerRef.current.mute();
          } else if (typeof playerRef.current.setVolume === 'function') {
            // fallback: silenciar via volume
            playerRef.current.setVolume(0);
          }
        }
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, isStreaming]);

  const handleEnableAudio = () => {
    setAudioEnabled(true);
    showToast('🔊 Áudio ativado');
    if (playerRef.current && playerRef.current.unMute) playerRef.current.unMute();
  };

  return (
    <>
      <div className={styles.container}>
        {isStreaming && hasStartedOnce && !audioEnabled && (
          <div className={styles.overlay} onClick={handleEnableAudio}>
            <img src={muteImg} alt="Som desligado" className={styles.muteIcon} />
          </div>
        )}

        {/* Player container (YouTube IFrame API will replace this div with an iframe) */}
        {isStreaming && links.length > 0 ? (
          <div id="player" className={styles.video} style={{ width: '100%', height: '100%' }}></div>
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
