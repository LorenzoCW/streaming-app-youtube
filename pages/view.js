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
  const [isLoaded, setIsLoaded] = useState(false);
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

  // YouTube IFrame API loader
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
      document.body.appendChild(script);
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
        // stopped -> limpa player para evitar manipulação do DOM pela YT API
        if (playerRef.current) {
          try {
            if (typeof playerRef.current.destroy === 'function') {
              playerRef.current.destroy();
            } else if (typeof playerRef.current.stopVideo === 'function') {
              playerRef.current.stopVideo();
            }
          } catch (e) {
            console.warn('Erro ao limpar YT player:', e);
          }
          playerRef.current = null;
        }

        setIsStreaming(false);
      } else {
        // started
        setHasStartedOnce(true);
        setIsStreaming(true);
      }
    });
    onlineUnsubRef.current = onlineUnsub;

    setIsLoaded(true);

    return () => {
      if (linksUnsubRef.current) linksUnsubRef.current();
      if (onlineUnsubRef.current) onlineUnsubRef.current();

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
              // Se audioEnabled for false, mantemos muted
              // Se for true porque o usuário já clicou, não chamamos mute()
              if (!audioEnabled && typeof ev.target.mute === 'function') {
                ev.target.mute();
              } else {
                // tenta garantir que esteja audível
                if (typeof ev.target.unMute === 'function') {
                  try { ev.target.unMute(); } catch (e) { }
                } else if (typeof ev.target.setVolume === 'function') {
                  try { ev.target.setVolume(100); } catch (e) { }
                }
              }

              // carrega primeiro vídeo
              const first = links[0];
              if (first && first.videoId) {
                currentIndexRef.current = 0;
                try { ev.target.loadVideoById(first.videoId); } catch (e) { ev.target.cueVideoById(first.videoId); }
              }
            },
            onStateChange: (ev) => {
              if (ev.data === window.YT.PlayerState.ENDED) {
                const next = currentIndexRef.current + 1;
                if (next < links.length) {
                  currentIndexRef.current = next;
                  const nextVid = links[next].videoId;
                  try { playerRef.current.loadVideoById(nextVid); } catch (e) { playerRef.current.cueVideoById(nextVid); }
                } else {
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

      // ensure mute/unmute according to audioEnabled (se o player já existia)
      if (playerRef.current) {
        if (audioEnabled) {
          if (typeof playerRef.current.unMute === 'function') {
            try { playerRef.current.unMute(); } catch (e) { }
          } else if (typeof playerRef.current.setVolume === 'function') {
            try { playerRef.current.setVolume(100); } catch (e) { }
          }
        } else {
          if (typeof playerRef.current.mute === 'function') {
            try { playerRef.current.mute(); } catch (e) { }
          } else if (typeof playerRef.current.setVolume === 'function') {
            try { playerRef.current.setVolume(0); } catch (e) { }
          }
        }
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, isStreaming, audioEnabled]);

  const handleEnableAudio = () => {
    setAudioEnabled(true);
    if (isStreaming) showToast('🔊 Áudio ativado');

    // Se o player já existir, desmuta imediatamente
    if (playerRef.current) {
      if (typeof playerRef.current.unMute === 'function') {
        try { playerRef.current.unMute(); } catch (e) { console.warn('unMute erro', e); }
      } else if (typeof playerRef.current.setVolume === 'function') {
        try { playerRef.current.setVolume(100); } catch (e) { }
      }
    }
  };

  return (
    <>
      <div className={styles.container}>

        {/* Overlays */}
        {!audioEnabled && (
          isStreaming ? (
            <div className={styles.unmuteOverlay} onClick={handleEnableAudio}>
              <img src={muteImg} alt="Som desligado" className={styles.muteIcon} />
            </div>
          ) : (
            <div className={styles.joinOverlay} onClick={handleEnableAudio}></div>
          )
        )}

        {/* Player container (YouTube IFrame API will replace this div with an iframe) */}
        {isStreaming && links.length > 0 ? (
          <div className={styles.videoWrapper} style={{ width: '100%', height: '100%' }}>
            {/* prevent clicks and context menu */}
            <div
              className={styles.clickBlocker}
              onClick={() => { }}
              onDoubleClick={() => { }}
              onContextMenu={(e) => e.preventDefault()}
              role="presentation"
            />
            <div id="player" className={styles.video} style={{ width: '100%', height: '100%' }}></div>
          </div>
        ) : (
          // Not streaming
          isLoaded && <>
            <div className={styles.poster}>
              <h1 className={styles.heading}>C I M E N A</h1>
              <span className={styles.subHeading}>
                {hasStartedOnce ? <p>Stream encerrada</p> : <WaveText />}
              </span>
            </div>

            <div className={styles.initPoster}>
              <span className={`${styles.initHeading} ${audioEnabled && styles.initHeadingFade}`}>
                {"Toque para entrar"}
              </span>
            </div>

            <div>
              <svg
                className={`${styles.waves} ${audioEnabled && styles.wavesLow}`}
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
                  {/* <use xlinkHref="#gentle-wave" x="48" y="0" fill="rgba(90, 197, 241, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="3" fill="rgba(37, 151, 213, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="5" fill="rgba(17, 107, 180, 1)" />
                  <use xlinkHref="#gentle-wave" x="48" y="7" fill="rgba(21, 71, 139, 1)" /> */}
                  <use xlinkHref="#gentle-wave" x="48" y="0" fill="rgba(255, 255, 255, 0.7)" />
                  <use xlinkHref="#gentle-wave" x="48" y="3" fill="rgba(255, 255, 255, 0.5)" />
                  <use xlinkHref="#gentle-wave" x="48" y="5" fill="rgba(255, 255, 255, 0.3)" />
                  <use xlinkHref="#gentle-wave" x="48" y="7" fill="rgba(255, 255, 255, 1)" />
                </g>
              </svg>
            </div>

            <div className={`${styles.fill} ${audioEnabled && styles.fillLow}`}></div>
          </>

        )}
      </div>

      <ToastContainer />
    </>
  );
}
