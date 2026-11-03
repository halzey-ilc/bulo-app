import React, { memo, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { MAP_HTML } from './mapHtml';

export interface MapFrameHandle {
  post: (msg: unknown) => void;
}

/** Веб: react-native-webview не работает — та же страница в iframe, общение через postMessage. */
export const MapFrame = memo(function MapFrame({
  ref,
  onMessage,
  style,
}: {
  ref?: React.Ref<MapFrameHandle>;
  onMessage: (data: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const cb = useRef(onMessage);
  cb.current = onMessage;

  useImperativeHandle(ref, () => ({
    post: (msg) => frame.current?.contentWindow?.postMessage(JSON.stringify({ __bulo: true, msg }), '*'),
  }));

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return;
      cb.current(e.data);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);

  return (
    <View style={[{ flex: 1, backgroundColor: '#EFE9DA' }, style]}>
      {React.createElement('iframe', {
        ref: frame,
        srcDoc: MAP_HTML,
        title: 'Карта',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
});
