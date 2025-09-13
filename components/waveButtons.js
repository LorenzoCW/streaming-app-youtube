// waveButtons.js
import Link from 'next/link';
import styles from '../styles/waveButtons.module.css';

const WaveButtons = () => {
  return (
    <div className={styles.buttons}>
      <Link href="/share">
        <div className={styles.ecard}>
          <div className={styles.image}></div>

          <div className={styles.wave}></div>
          <div className={styles.wave}></div>
          <div className={styles.wave}></div>

          <div className={styles.text}>
            STREAM
          </div>
        </div>
      </Link>

      <Link href="/view">
        <div className={`${styles.ecard} ${styles.ecardRed}`}>
          <div className={styles.image}></div>

          <div className={`${styles.wave} ${styles.waveRed}`}></div>
          <div className={`${styles.wave} ${styles.waveRed}`}></div>
          <div className={`${styles.wave} ${styles.waveRed}`}></div>

          <div className={styles.text}>
            VIEW
          </div>
        </div>
      </Link>

    </div>
  );
};


export default WaveButtons;