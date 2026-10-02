import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import {
  smartGetDocuments,
  smartGetDocumentsByDateRange,
  smartSetDocument,
} from '../../services/smartSyncService';
import { loadCustomerPromotionSettings } from '../../services/customerPromotionService';
import {
  ACTIVE_PROMOTION_SETTINGS_ID,
  CustomerPromotionPrize,
  CustomerPromotionReward,
  CustomerPromotionSettings,
  getDefaultPromotionSettings,
  getPromotionPrizePlan,
  PromotionPrizeType,
  validatePromotionSettings,
} from '../../utils/customerPromotion';
import { getLocalDateTimeString, getTodayString } from '../../utils/localTime';
import './CustomerPromotionWheel.css';

interface PromotionMenuItem {
  id: string;
  name: string;
  available?: boolean;
}

interface EditableNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number;
  fallbackValue?: number;
  integer?: boolean;
  onValueChange: (value: number) => void;
}

const PRIZE_COLORS = ['#be2530', '#0f8179', '#e4a521', '#2666c7', '#7c2d8f', '#15885a', '#d45c18', '#375a7f'];

const EditableNumberInput: React.FC<EditableNumberInputProps> = ({
  value,
  fallbackValue = 0,
  integer = false,
  onValueChange,
  min,
  max,
  ...props
}) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = (rawValue: string, enforceLimits = false) => {
    if (rawValue.trim() === '' || !Number.isFinite(Number(rawValue))) return;
    let nextValue = integer ? Math.round(Number(rawValue)) : Number(rawValue);
    if (enforceLimits && min !== undefined) nextValue = Math.max(Number(min), nextValue);
    if (enforceLimits && max !== undefined) nextValue = Math.min(Number(max), nextValue);
    onValueChange(nextValue);
    if (enforceLimits) setDraft(String(nextValue));
  };

  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={event => {
        setDraft(event.target.value);
        commit(event.target.value);
      }}
      onBlur={() => {
        if (draft.trim() === '' || !Number.isFinite(Number(draft))) {
          onValueChange(fallbackValue);
          setDraft(String(fallbackValue));
          return;
        }
        commit(draft, true);
      }}
    />
  );
};

const cloneSettings = (settings: CustomerPromotionSettings): CustomerPromotionSettings => (
  JSON.parse(JSON.stringify(settings))
);

const CustomerPromotionSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const today = getTodayString();
  const initialSettings = getDefaultPromotionSettings(today);
  const [savedSettings, setSavedSettings] = useState<CustomerPromotionSettings>(initialSettings);
  const [draftSettings, setDraftSettings] = useState<CustomerPromotionSettings>(initialSettings);
  const [menuItems, setMenuItems] = useState<PromotionMenuItem[]>([]);
  const [usedPrizeCounts, setUsedPrizeCounts] = useState<Record<string, number>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState('');

  const loadSettings = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [activeSettings, rewards, items] = await Promise.all([
        loadCustomerPromotionSettings(today, true),
        smartGetDocumentsByDateRange('customer_rewards', 'dateKey', today, today, true),
        smartGetDocuments('menu_items', true),
      ]);
      const nextCounts = (rewards as CustomerPromotionReward[]).reduce<Record<string, number>>((counts, reward) => {
        if (reward.status !== 'void') counts[reward.prizeId] = Number(counts[reward.prizeId] || 0) + 1;
        return counts;
      }, {});
      setSavedSettings(activeSettings);
      setDraftSettings(cloneSettings(activeSettings));
      setUsedPrizeCounts(nextCounts);
      setMenuItems((items as PromotionMenuItem[])
        .filter(item => item.available !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setLastSyncedAt(getLocalDateTimeString());
    } catch (error) {
      console.error('Promotion settings refresh failed:', error);
      alert(t('promotion.settings.loadFailed'));
    } finally {
      setIsRefreshing(false);
    }
  }, [t, today]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const prizePlan = useMemo(() => getPromotionPrizePlan(draftSettings), [draftSettings]);
  const assignedTotal = Object.values(prizePlan).reduce((sum, count) => sum + count, 0);
  const issuedToday = Object.values(usedPrizeCounts).reduce((sum, count) => sum + count, 0);
  const probabilityTotal = draftSettings.prizes
    .filter(prize => prize.active)
    .reduce((sum, prize) => sum + Number(prize.probability || 0), 0);

  const updateDraftPrize = (index: number, patch: Partial<CustomerPromotionPrize>) => {
    setDraftSettings(current => ({
      ...current,
      prizes: current.prizes.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const changePrizeType = (index: number, type: PromotionPrizeType) => {
    const firstMenuItem = menuItems[0];
    updateDraftPrize(index, {
      type,
      amount: type === 'fixed' ? 10 : 0,
      label: type === 'gift' ? '' : type === 'dish' ? firstMenuItem?.name || '' : '',
      menuItemId: type === 'dish' ? firstMenuItem?.id || '' : '',
    });
  };

  const addPrize = () => {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setDraftSettings(current => ({
      ...current,
      prizes: [...current.prizes, {
        id,
        type: 'gift',
        amount: 0,
        label: '',
        probability: 0,
        active: true,
        color: PRIZE_COLORS[current.prizes.length % PRIZE_COLORS.length],
      }],
    }));
  };

  const removePrize = (index: number) => {
    setDraftSettings(current => ({
      ...current,
      prizes: current.prizes.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const saveSettings = async () => {
    const validation = validatePromotionSettings(draftSettings);
    if (validation) {
      alert(validation === 'probability-total'
        ? t('promotion.settings.probabilityError')
        : t('promotion.settings.valueError'));
      return;
    }
    if (draftSettings.prizes.some(prize => Number(prizePlan[prize.id] || 0) < Number(usedPrizeCounts[prize.id] || 0))) {
      alert(t('promotion.settings.issuedError'));
      return;
    }

    setIsSaving(true);
    try {
      const nextSettings: CustomerPromotionSettings = {
        ...draftSettings,
        id: ACTIVE_PROMOTION_SETTINGS_ID,
        dateKey: today,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.name || user?.username || 'system',
      };
      const result = await smartSetDocument('customer_promotion_settings', ACTIVE_PROMOTION_SETTINGS_ID, nextSettings);
      if (!result.success && !result.pending) {
        alert(t('promotion.settings.saveFailed'));
        return;
      }
      setSavedSettings(nextSettings);
      setDraftSettings(cloneSettings(nextSettings));
      setLastSyncedAt(getLocalDateTimeString());
      alert(result.pending ? t('promotion.settings.savedPending') : t('promotion.settings.saved'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="promotion-page promotion-settings-page">
      <div className="promotion-toolbar">
        <div>
          <div className="promotion-breadcrumb">
            <button type="button" onClick={() => navigate('/customers')}>{t('nav.customers.records')}</button>
            <span>/</span>
            <strong>{t('nav.customers.promotionSettings')}</strong>
          </div>
          <h1>{t('promotion.settings.pageTitle')}</h1>
          <p>{t('promotion.settings.pageSubtitle')}</p>
        </div>
        <div className="promotion-toolbar-actions">
          <span>{lastSyncedAt ? `${t('promotion.synced')} ${lastSyncedAt.slice(11, 16)}` : t('promotion.notSynced')}</span>
          <button type="button" className="promotion-button secondary" onClick={() => navigate('/customers/promotion')}>
            {t('promotion.settings.openWheel')}
          </button>
          <button type="button" className="promotion-button secondary" onClick={loadSettings} disabled={isRefreshing}>
            {isRefreshing ? t('promotion.refreshing') : t('promotion.refresh')}
          </button>
        </div>
      </div>

      <section className="promotion-settings-surface">
        <div className="promotion-settings-header">
          <div><span>{t('promotion.settings.activeScope')}</span><h2>{t('promotion.settings.title')}</h2></div>
        </div>
        <div className="promotion-order-amount promotion-settings-minimum">
          <span>{t('promotion.settings.minimumOrderAmount')}</span>
          <EditableNumberInput
            min="0"
            value={draftSettings.minimumOrderAmount}
            onValueChange={minimumOrderAmount => setDraftSettings(current => ({ ...current, minimumOrderAmount }))}
          />
          <small>{t('promotion.settings.minimumOrderHelp')}</small>
        </div>
        <div className="promotion-plan-overview">
          <label>
            <span>{t('promotion.settings.expectedDailyDraws')}</span>
            <EditableNumberInput
              min="1"
              step="1"
              integer
              fallbackValue={1}
              value={draftSettings.expectedDailyDraws}
              onValueChange={expectedDailyDraws => setDraftSettings(current => ({ ...current, expectedDailyDraws }))}
            />
          </label>
          <div><span>{t('promotion.plan.assigned')}</span><strong>{assignedTotal}</strong></div>
          <div><span>{t('promotion.plan.issued')}</span><strong>{issuedToday}</strong></div>
          <div><span>{t('promotion.plan.remaining')}</span><strong>{Math.max(0, draftSettings.expectedDailyDraws - issuedToday)}</strong></div>
          <small>{t('promotion.settings.expectedDailyHelp')}</small>
        </div>
        <div className="promotion-settings-table-wrap">
          <div className="promotion-settings-tools">
            <span>{t('promotion.settings.customHelp')}</span>
            <button type="button" className="promotion-button secondary" onClick={addPrize}>+ {t('promotion.settings.addPrize')}</button>
          </div>
          <table>
            <thead><tr>
              <th>{t('promotion.settings.type')}</th><th>{t('promotion.settings.prize')}</th><th>{t('promotion.settings.active')}</th>
              <th>{t('promotion.settings.probability')}</th><th>{t('promotion.settings.planned')}</th><th />
            </tr></thead>
            <tbody>{draftSettings.prizes.map((prize, index) => (
              <tr key={prize.id}>
                <td>
                  <select value={prize.type} onChange={event => changePrizeType(index, event.target.value as PromotionPrizeType)}>
                    <option value="fixed">{t('promotion.prize.fixed')}</option>
                    <option value="dish">{t('promotion.prize.dish')}</option>
                    <option value="gift">{t('promotion.prize.gift')}</option>
                    <option value="full_order">{t('promotion.prize.fullOrder')}</option>
                  </select>
                </td>
                <td className="promotion-prize-editor">
                  <span className="promotion-color-dot" style={{ background: prize.color }} />
                  {prize.type === 'fixed' && <EditableNumberInput min="1" fallbackValue={1} value={prize.amount} aria-label={t('promotion.settings.amount')} onValueChange={amount => updateDraftPrize(index, { amount })} />}
                  {prize.type === 'dish' && (
                    <select
                      value={prize.menuItemId || ''}
                      onChange={event => {
                        const item = menuItems.find(menuItem => menuItem.id === event.target.value);
                        updateDraftPrize(index, { menuItemId: item?.id || '', label: item?.name || '' });
                      }}
                    >
                      <option value="">{isRefreshing ? t('promotion.settings.loadingDishes') : t('promotion.settings.selectDish')}</option>
                      {menuItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  )}
                  {prize.type === 'gift' && <input type="text" value={prize.label || ''} placeholder={t('promotion.settings.giftPlaceholder')} onChange={event => updateDraftPrize(index, { label: event.target.value })} />}
                  {prize.type === 'full_order' && <strong>{t('promotion.prize.fullOrder')}</strong>}
                </td>
                <td><input type="checkbox" checked={prize.active} onChange={event => updateDraftPrize(index, { active: event.target.checked })} /></td>
                <td><EditableNumberInput min="0" max="100" value={prize.probability} onValueChange={probability => updateDraftPrize(index, { probability })} /></td>
                <td><strong className="promotion-planned-count">{prizePlan[prize.id] || 0}</strong></td>
                <td><button type="button" className="promotion-delete-prize" onClick={() => removePrize(index)} aria-label={t('promotion.settings.deletePrize')}>×</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="promotion-probability-total">
          <span>{t('promotion.settings.total')}</span>
          <strong className={Math.abs(probabilityTotal - 100) < 0.001 ? '' : 'invalid'}>{probabilityTotal}%</strong>
        </div>
        <div className="promotion-settings-actions">
          <button type="button" className="promotion-button secondary" onClick={() => setDraftSettings(cloneSettings(savedSettings))}>
            {t('promotion.settings.reset')}
          </button>
          <button type="button" className="promotion-button primary" onClick={saveSettings} disabled={isSaving}>
            {isSaving ? t('promotion.settings.saving') : t('promotion.settings.save')}
          </button>
        </div>
      </section>
    </div>
  );
};

export default CustomerPromotionSettingsPage;
