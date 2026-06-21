import React from 'react';
import { colors, font, radii, shadows, spacing } from './uiTokens';

export const adminPageStyle: React.CSSProperties = {
  minHeight: '100%',
  background: colors.page,
  color: colors.textPrimary,
  padding: spacing.page,
  boxSizing: 'border-box',
  fontFamily: font.family,
};

export const adminHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.section,
  marginBottom: spacing.section,
};

export const adminTitleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.textPrimary,
  fontSize: font.title,
  fontWeight: 700,
  letterSpacing: 0,
};

export const adminSubtitleStyle: React.CSSProperties = {
  marginTop: '0.35rem',
  color: colors.textSecondary,
  fontSize: font.body,
};

export const adminCardStyle: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.lg,
  boxShadow: shadows.soft,
};

export const adminToolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  flexWrap: 'wrap',
  padding: '0.85rem 1rem',
  background: colors.surfaceMuted,
  borderBottom: `1px solid ${colors.border}`,
};

export const adminButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: radii.md,
  padding: '0.62rem 1rem',
  background: colors.teal,
  color: colors.surface,
  fontSize: font.body,
  fontWeight: 650,
  cursor: 'pointer',
};

export const adminSecondaryButtonStyle: React.CSSProperties = {
  ...adminButtonStyle,
  background: colors.surface,
  color: colors.textPrimary,
  border: `1px solid ${colors.borderStrong}`,
};

export const adminInputStyle: React.CSSProperties = {
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.md,
  padding: '0.62rem 0.75rem',
  background: colors.surface,
  color: colors.textPrimary,
  fontSize: font.body,
  outline: 'none',
  boxSizing: 'border-box',
};

export const adminMutedTextStyle: React.CSSProperties = {
  color: colors.textSecondary,
  fontSize: font.body,
};

export const adminBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: radii.pill,
  padding: '0.22rem 0.55rem',
  background: colors.blueSoft,
  color: colors.blue,
  fontSize: font.caption,
  fontWeight: 650,
};

