import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * 为低于 Chrome 76 的老旧 Android WebView 补充 Promise.allSettled 极简兜底，
 * 避免第三方依赖在缺少该方法时触发运行时异常
 */
function ensurePromiseAllSettled(): void {
  const promiseCtor = Promise as unknown as {
    allSettled?: (
      promises: Iterable<unknown>
    ) => Promise<
      Array<{ status: 'fulfilled'; value: unknown } | { status: 'rejected'; reason: unknown }>
    >;
  };

  if (typeof promiseCtor.allSettled !== 'function') {
    promiseCtor.allSettled = (promises: Iterable<unknown>) => {
      const items = Array.from(promises);
      return Promise.all(
        items.map((item) =>
          Promise.resolve(item).then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason) => ({ status: 'rejected' as const, reason })
          )
        )
      );
    };
  }
}

ensurePromiseAllSettled();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
