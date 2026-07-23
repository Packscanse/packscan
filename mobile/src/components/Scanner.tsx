import React, { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Card, colors } from "../ui";

/**
 * Camera barcode/QR scanner used for both parcel labels and pickup codes.
 * Debounces repeat reads of the same value so one physical label doesn't
 * fire a burst of detections.
 */
export function Scanner({
  onScan,
  permissionText,
  grantText,
  height,
}: {
  onScan: (value: string) => void;
  permissionText: string;
  grantText: string;
  height?: number;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  if (!permission) return <View style={[styles.frame, height ? { height } : null]} />;
  if (!permission.granted) {
    return (
      <Card>
        <Text style={{ color: colors.text }}>{permissionText}</Text>
        <Button title={grantText} onPress={() => void requestPermission()} />
      </Card>
    );
  }

  return (
    <View style={[styles.frame, height ? { height } : null]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [
            "qr",
            "code128",
            "code39",
            "code93",
            "ean13",
            "ean8",
            "upc_a",
            "upc_e",
            "itf14",
            "codabar",
            "datamatrix",
            "pdf417",
            "aztec",
          ],
        }}
        onBarcodeScanned={({ data }) => {
          if (!data) return;
          const now = Date.now();
          if (data === last.current.value && now - last.current.at < 2500) return;
          last.current = { value: data, at: now };
          onScan(data);
        }}
      />
      <View style={styles.reticle} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 240,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  reticle: {
    position: "absolute",
    width: "64%",
    height: 130,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    borderStyle: "dashed",
    borderRadius: 20,
  },
});
