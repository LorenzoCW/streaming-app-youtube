// toastUtils.js
import { toast, Slide } from 'react-toastify';

export const toastQueue = [];
export const isShowing = { current: false };

export const processQueue = () => {
  if (isShowing.current || toastQueue.length === 0) return;
  isShowing.current = true;
  const nextMessage = toastQueue.shift();
  toast.info(nextMessage, {
    position: 'top-right',
    autoClose: 5000,
    pauseOnFocusLoss: false,
    pauseOnHover: false,
    theme: 'light',
    icon: false,
    transition: Slide,
    onOpen: () => {
      setTimeout(() => {
        isShowing.current = false;
        processQueue();
      }, 2000);
    },
  });
};

export const showLog = (...args) => {
  if (true) {
    console.log(...args);
  }
};

export const showToast = (...args) => {
  showLog(...args);
  toastQueue.push(args.join(' '));
  processQueue();
};