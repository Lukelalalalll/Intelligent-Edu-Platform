import React, { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

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
    console.error('[RouteErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ color: '#d32f2f', marginBottom: '16px' }}>This page encountered an error</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '10px 24px', background: '#007B55', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
              }}
            >
              Retry
            </button>
            <button
              onClick={this.props.onGoHome}
              style={{
                padding: '10px 24px', background: '#555', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
              }}
            >
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
