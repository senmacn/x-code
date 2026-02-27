"use client";

import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="surface-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-rose-600 text-xl">!</span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {this.props.fallbackTitle || "页面出现异常"}
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {this.state.error?.message || "未知错误"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-colors"
          >
            <RefreshCw size={14} />
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
