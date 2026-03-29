import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import Card from './Card';
import Button from './Button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-8 px-4">
          <Card className="text-center !py-8">
            <AlertTriangle size={28} className="mx-auto mb-3 text-salve-amber" />
            <h3 className="font-playfair text-base text-salve-text mb-2">Something went wrong</h3>
            <p className="text-[13px] text-salve-textMid mb-4">This section encountered an error.</p>
            <Button
              variant="secondary"
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onReset?.();
              }}
              className="!text-xs"
            >
              Go Home
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
