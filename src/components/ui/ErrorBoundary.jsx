import { Component } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { captureError } from '../../services/sentry';

/**
 * ErrorBoundary catches render-time errors in the child tree and shows a
 * friendly fallback with recovery buttons.
 *
 * Props:
 *   - resetKey: when this prop value changes, the boundary auto-resets so
 *     that navigating to a different section via BottomNav / SideNav clears
 *     a previously-crashed view (otherwise the error persists across every
 *     subsequent navigation since the boundary itself stays mounted).
 *   - onReset: optional callback fired when user taps "Go home".
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, lastResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props, state) {
    // Auto-reset when the parent changes resetKey (e.g. on tab navigation).
    if (props.resetKey !== state.lastResetKey) {
      return { hasError: false, error: null, lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    // Report to Sentry (scrubbed of PHI via beforeSend in services/sentry.js)
    captureError(error, { componentStack: info?.componentStack });
  }

  handleRetry = () => {
    // Clear the error flag so the children re-render. If whatever caused the
    // crash is still in state, it'll crash again and we'll land back here.
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-8 px-4">
          <Card className="text-center !py-8">
            <AlertTriangle size={28} className="mx-auto mb-3 text-salve-amber" />
            <h3 className="font-playfair text-base text-salve-text mb-2">Something went wrong</h3>
            <p className="text-[15px] text-salve-textMid mb-4">
              This section hit an error while rendering. You can reload this view, or head home and try a different section.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button
                variant="lavender"
                onClick={this.handleRetry}
                className="!text-xs"
              >
                <RotateCcw size={13} /> Reload this view
              </Button>
              <Button
                variant="secondary"
                onClick={this.handleGoHome}
                className="!text-xs"
              >
                <Home size={13} /> Go home
              </Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
