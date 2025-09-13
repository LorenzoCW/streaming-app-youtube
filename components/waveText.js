// waveText.js
import { useEffect } from 'react';

const WaveText = () => {
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            body {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #101010;
                color: #fff;
                font-family: sans-serif;
            }

            .wave-text span {
                display: inline-block;
                font-size: 3rem;
                animation: wave 3s ease-in-out infinite;
            }

            @media screen and (max-width: 470px) {
                .wave-text span {
                    font-size: 2rem;
                }
                }

            .wave-text span:nth-child(1) {
                animation-delay: 0s;
            }
            .wave-text span:nth-child(2) {
                animation-delay: 0.2s;
            }
            .wave-text span:nth-child(3) {
                animation-delay: 0.4s;
            }
            .wave-text span:nth-child(4) {
                animation-delay: 0.6s;
            }
            .wave-text span:nth-child(5) {
                animation-delay: 0.8s;
            }
            .wave-text span:nth-child(6) {
                animation-delay: 1s;
            }
            .wave-text span:nth-child(7) {
                animation-delay: 1.2s;
            }
            .wave-text span:nth-child(8) {
                animation-delay: 1.4s;
            }
            .wave-text span:nth-child(9) {
                animation-delay: 1.6s;
            }
            .wave-text span:nth-child(10) {
                animation-delay: 1.8s;
            }
            .wave-text span:nth-child(11) {
                animation-delay: 2s;
            }
            .wave-text span:nth-child(12) {
                animation-delay: 2.2s;
            }
            .wave-text span:nth-child(13) {
                animation-delay: 2.4s;
            }
            .wave-text span:nth-child(14) {
                animation-delay: 2.6s;
            }
            .wave-text span:nth-child(15) {
                animation-delay: 2.8s;
            }
            .wave-text span:nth-child(16) {
                animation-delay: 3s;
            }
            .wave-text span:nth-child(17) {
                animation-delay: 3.2s;
            }
            .wave-text span:nth-child(18) {
                animation-delay: 3.4s;
            }
            .wave-text span:nth-child(19) {
                animation-delay: 3.6s;
            }
            .wave-text span:nth-child(20) {
                animation-delay: 3.8s;
            }

            @keyframes wave {
                0%, 100% {
                    transform: translateY(0);
                }
                50% {
                    transform: translateY(-5px);
                }
            }
        `;
        document.head.appendChild(style);

        // Cleanup the style when the component unmounts
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    return (
        <div className="wave-container">
            <p className="wave-text">
                <span>A</span>
                <span>g</span>
                <span>u</span>
                <span>a</span>
                <span>r</span>
                <span>d</span>
                <span>a</span>
                <span>n</span>
                <span>d</span>
                <span>o</span>
                <span>&nbsp;</span>
                <span>s</span>
                <span>t</span>
                <span>r</span>
                <span>e</span>
                <span>a</span>
                <span>m</span>
                <span>.</span>
                <span>.</span>
                <span>.</span>
            </p>
        </div>
    );
};

export default WaveText;