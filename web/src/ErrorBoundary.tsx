import { Component } from 'react';
import type { ReactNode } from 'react';
import { reportError, whereFromStack } from './analytics/errors';

/** Last-resort screen for render errors; reports only the error class and the asset frame only. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    reportError('react', error, whereFromStack(error.stack, location.origin));
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <p role="alert" data-testid="app-error">
          Ocorreu um erro. Recarregue a página.
        </p>
        <button type="button" onClick={() => location.reload()}>
          Recarregar
        </button>
      </>
    );
  }
}
