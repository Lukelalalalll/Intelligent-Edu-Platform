import React, { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { log } from './utils/logger';
import { useI18n } from '@/shared/i18n';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

interface ErrorLabels {
  title: string;
  unexpected: string;
  retry: string;
  backHome: string;
}

class RouteErrorBoundaryInner extends React.Component<
  Props & { labels: ErrorLabels; onGoHome: () => void },
  State
> {
  constructor(props: Props & { labels: ErrorLabels; onGoHome: () => void }) {
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
      const { labels } = this.props;
      return (
        <div className={styles.container}>
          <h2 className={styles.title}>{labels.title}</h2>
          <p className={styles.message}>
            {this.state.error?.message || labels.unexpected}
          </p>
          <div className={styles.actions}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className={styles.retryBtn}
            >
              {labels.retry}
            </button>
            <button onClick={this.props.onGoHome} className={styles.homeBtn}>
              {labels.backHome}
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
  const { t } = useI18n();
  return (
    <RouteErrorBoundaryInner
      labels={{
        title: t('error.pageTitle'),
        unexpected: t('error.unexpected'),
        retry: t('error.retry'),
        backHome: t('error.backHome'),
      }}
      onGoHome={() => navigate('/')}
    >
      {children}
    </RouteErrorBoundaryInner>
  );
}
