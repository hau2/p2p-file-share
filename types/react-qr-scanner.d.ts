/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "react-qr-scanner" {
  import { ComponentType } from "react";

  interface QrScannerProps {
    delay?: number;
    style?: React.CSSProperties;
    onError?: (error: any) => void;
    onScan?: (data: string | null) => void;
    constraints?: MediaTrackConstraints;
  }

  const QrScanner: ComponentType<QrScannerProps>;

  export default QrScanner;
}
