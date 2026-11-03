import React, { memo, useImperativeHandle, useRef } from 'react';
import { Linking, StyleProp, ViewStyle } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { MAP_HTML } from './mapHtml';

type WebViewRef = { injectJavaScript: (js: string) => void };
// Типы react-native-webview (класс) пока не дружат с @types/react 19 — описываем как функцию.
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebViewRef> }>;

export interface MapFrameHandle {
  post: (msg: unknown) => void;
}

/** iOS/Android: страница карты в WebView. Перерисовка родителя страницу не перезагружает. */
export const MapFrame = memo(function MapFrame({
  ref,
  onMessage,
  style,
}: {
  ref?: React.Ref<MapFrameHandle>;
  onMessage: (data: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const web = useRef<WebViewRef>(null);
  useImperativeHandle(ref, () => ({
    post: (msg) => web.current?.injectJavaScript(`window.__bulo && window.__bulo(${JSON.stringify(msg)});true;`),
  }));
  return (
    <WebView
      ref={web}
      source={{ html: MAP_HTML, baseUrl: 'https://bulo.kg/' }}
      originWhitelist={['*']}
      onMessage={(e: WebViewMessageEvent) => onMessage(e.nativeEvent.data)}
      style={[{ flex: 1, backgroundColor: '#EFE9DA' }, style]}
      containerStyle={{ backgroundColor: '#EFE9DA' }}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      setSupportMultipleWindows={false}
      allowsLinkPreview={false}
      cacheEnabled
      // ссылки из атрибуции открываем в браузере, а не внутри карты
      onShouldStartLoadWithRequest={(r: { url: string }) => {
        if (r.url.startsWith('http') && !r.url.startsWith('https://bulo.kg')) {
          Linking.openURL(r.url).catch(() => {});
          return false;
        }
        return true;
      }}
    />
  );
});
