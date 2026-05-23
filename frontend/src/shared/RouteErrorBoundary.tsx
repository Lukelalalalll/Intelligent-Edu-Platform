import React, { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { log } from './utils/logger';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class RouteErrorBoundaryInner extends React.Component<
  Props & { onGoHome: () => void },
  State
> {
  constructor(props: Props & { onGoHome: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('RouteErrorBoundary', 'componentDidCatch', { error: error.message, componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <h2 className={styles.title}>This page encountered an error</h2>
          <p className={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div className={styles.actions}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className={styles.retryBtn}
            >
              Retry
            </button>
            <button onClick={this.props.onGoHome} className={styles.homeBtn}>
              Back to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RouteErrorBoundary({ children }: Props) {
  const navigate = useNavigate();
  return (
    <RouteErrorBoundaryInner onGoHome={() => navigate('/')}>
      {children}
    </RouteErrorBoundaryInner>
  );
}
