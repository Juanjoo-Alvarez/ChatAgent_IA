import type { CSSProperties } from "react";
import type { AGIChatTheme } from "../../theme";

export const widgetStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  width: "min(100%, 420px)",
  maxWidth: 420,
  height: "min(640px, 100dvh)",
  minHeight: "min(420px, 100dvh)",
  maxHeight: "100dvh",
  border: `1px solid ${theme.widgetBorder}`,
  borderRadius: theme.widgetRadius,
  overflow: "hidden",
  backgroundColor: theme.widgetBackground,
  fontFamily: theme.fontFamily,
  boxShadow: theme.widgetShadow,
  color: theme.agentBubbleText
});

export const headerStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacingMedium,
  padding: `${theme.spacingMedium + 4}px ${theme.spacingLarge}px`,
  background: theme.headerBackground,
  color: theme.headerText
});

export const headerAvatarStyle = (theme: AGIChatTheme): CSSProperties => ({
  position: "relative",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  width: 42,
  height: 42,
  borderRadius: 14,
  color: theme.agentAvatarText,
  backgroundColor: theme.agentAvatarBackground,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.2)"
});

export const onlineIndicatorStyle = (theme: AGIChatTheme): CSSProperties => ({
  position: "absolute",
  right: -2,
  bottom: -2,
  width: 11,
  height: 11,
  borderRadius: "50%",
  backgroundColor: theme.onlineIndicator,
  border: `2px solid ${theme.headerAvatarBorder}`
});

export const headerCopyStyle: CSSProperties = {
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: 2
};

export const titleStyle = (theme: AGIChatTheme): CSSProperties => ({
  fontSize: theme.fontSize + 2,
  fontWeight: 700,
  lineHeight: 1.2
});

export const subtitleStyle = (theme: AGIChatTheme): CSSProperties => ({
  fontSize: theme.smallFontSize,
  lineHeight: 1.3,
  color: theme.headerMutedText
});

export const messageListStyle = (theme: AGIChatTheme): CSSProperties => ({
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacingSmall,
  padding: `${theme.spacingLarge}px ${theme.spacingMedium}px`,
  scrollbarWidth: "thin"
});

export const typingIndicatorStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  alignSelf: "flex-start",
  gap: 8,
  margin: `0 ${theme.spacingMedium}px 10px`,
  padding: `${theme.spacingSmall}px ${theme.spacingMedium}px`,
  borderRadius: 14,
  backgroundColor: theme.agentBubbleBackground,
  fontSize: theme.smallFontSize,
  color: theme.mutedText,
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)"
});

export const typingDotsStyle: CSSProperties = {
  display: "inline-flex",
  gap: 3,
  alignItems: "center"
};

export const typingDotStyle = (theme: AGIChatTheme): CSSProperties => ({
  display: "block",
  width: 5,
  height: 5,
  borderRadius: "50%",
  backgroundColor: theme.mutedText
});

export const errorBannerStyle = (theme: AGIChatTheme): CSSProperties => ({
  margin: `0 ${theme.spacingMedium}px 10px`,
  padding: `9px ${theme.spacingMedium}px`,
  borderRadius: 10,
  fontSize: theme.smallFontSize,
  color: theme.errorText,
  backgroundColor: theme.errorBackground
});

export const emptyStateStyle = (theme: AGIChatTheme): CSSProperties => ({
  margin: "auto",
  maxWidth: 280,
  color: theme.mutedText,
  fontSize: theme.fontSize - 1,
  lineHeight: 1.55,
  textAlign: "center",
  padding: "24px"
});

