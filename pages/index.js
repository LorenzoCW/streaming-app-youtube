// index.js
import styles from '../styles/home.module.css';
import WaveButtons from '../components/waveButtons';

export default function Home() {
  return (
    <>
      <div className={styles.header}>
        <div className={`${styles['inner-header']} ${styles.flex}`}>
          <h1 className={styles.heading}>C I M E N A</h1>
        </div>

        <div className={styles.buttons}>
          <WaveButtons />
        </div>

      </div >
    </>
  );
}