import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { getLocalDateString } from '../../utils/exchangeRate'; // 🔥 导入本地日期工具

const WarehouseStocktake: React.FC = () => {
  const { inventoryItems, setInventoryItems } = useAppContext();
  
  // 状态管理
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [actualQuantities, setActualQuantities] = useState<Record<string, number>>({});
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(getLocalDateString());
  
  // 库存分类（从 localStorage 加载）
  const [inventoryCategories] = useState<Array<{ key: string; name: string; icon: string }>>(() => {
    try {
      const saved = localStorage.getItem('inventory_categories');
      return saved ? JSON.parse(saved) : [
        { key: 'ingredient', name: '食材', icon: '🥬' },
        { key: 'alcohol', name: '酒水', icon: '🍺' },
        { key: 'beverage', name: '饮料', icon: '🥤' },
        { key: 'other', name: '其他', icon: '📦' }
      ];
    } catch {
      return [
        { key: 'ingredient', name: '食材', icon: '🥬' },
        { key: 'alcohol', name: '酒水', icon: '🍺' },
        { key: 'beverage', name: '饮料', icon: '🥤' },
        { key: 'other', name: '其他', icon: '📦' }
      ];
    }
  });
  
  // 盘点历史
  const [stocktakeHistory, setStocktakeHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('warehouse_stocktake_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 获取过滤后的库存物品列表
  const getFilteredItems = () => {
    return inventoryItems.filter(item => 
      (categoryFilter === 'all' || item.category === categoryFilter) &&
      (!searchTerm || 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.barcode?.includes(searchTerm))
    );
  };

  const filteredItems = getFilteredItems();

  // 初始化实际数量
  useEffect(() => {
    const initial: Record<string, number> = {};
    filteredItems.forEach(item => {
      initial[item.id] = actualQuantities[item.id] ?? item.currentStock;
    });
    setActualQuantities(initial);
  }, [filteredItems.length]);

  // 扫码处理
  const handleScan = (barcode: string) => {
    const item = filteredItems.find(i => i.barcode === barcode);
    if (item) {
      const input = document.getElementById(`input-${item.id}`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }
  };

  // 完成盘点
  const completeStocktake = () => {
    const discrepancies: any[] = [];
    let hasDifference = false;

    filteredItems.forEach(item => {
      const actual = actualQuantities[item.id] ?? 0;
      const difference = actual - item.currentStock;
      if (difference !== 0) {
        discrepancies.push({
          itemName: item.name,
          systemStock: item.currentStock,
          actualStock: actual,
          difference,
          unit: item.unit
        });
        hasDifference = true;
      }
    });

    if (!hasDifference) {
      if (!window.confirm('盘点数据与系统库存完全一致，确认完成盘点吗？')) {
        return;
      }
    } else {
      const confirmMsg = `发现 ${discrepancies.length} 个商品存在差异，确认完成盘点并更新库存吗？`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    // 更新库存
    setInventoryItems(items => {
      return items.map(item => {
        if (actualQuantities[item.id] !== undefined) {
          return {
            ...item,
            currentStock: actualQuantities[item.id],
            lastUpdated: new Date()
          };
        }
        return item;
      });
    });

    // 保存盘点历史
    try {
      const saved = localStorage.getItem('warehouse_stocktake_history');
      const history = saved ? JSON.parse(saved) : [];
      const stocktakeRecord = {
        id: `stocktake-${Date.now()}`,
        date: getLocalDateString(), // 🔥 使用本地时间
        items: filteredItems.map(item => {
          const actualStock = actualQuantities[item.id] || 0;
          
          return {
            itemId: item.id,
            itemName: item.name,
            unit: item.unit,
            category: item.category,
            systemStock: item.currentStock,
            actualStock,
            difference: actualStock - item.currentStock
          };
        }),
        totalDiscrepancies: discrepancies.length
      };
      history.unshift(stocktakeRecord);
      localStorage.setItem('warehouse_stocktake_history', JSON.stringify(history.slice(0, 50)));
      setStocktakeHistory(history.slice(0, 50));
    } catch (error) {
      console.error('保存盘点历史失败:', error);
    }

    alert('盘点完成！');
  };

  // 导出CSV
  const exportToCSV = () => {
    const filteredHistory = stocktakeHistory.filter(record => {
      const recordDate = getLocalDateString(new Date(record.date)); // 🔥 使用本地时间
      return recordDate === selectedHistoryDate;
    });

    if (filteredHistory.length === 0) {
      alert('所选日期无盘点记录');
      return;
    }

    let csv = '\uFEFF';
    csv += '盘点时间,商品名称,分类,单位,系统库存,盘点值,差异\n';
    
    filteredHistory.forEach(record => {
      const date = new Date(record.date).toLocaleString('zh-CN');
      
      record.items.forEach((item: any) => {
        csv += `${date},${item.itemName},${item.category || ''},${item.unit || ''},${item.systemStock},${item.actualStock},${item.difference}\n`;
      });
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `仓库盘点记录_${selectedHistoryDate}.csv`;
    link.click();
  };

  // 渲染
  return (
    <div style={{ 
      padding: '1.5rem', 
      height: '100vh', 
      maxHeight: '100vh',
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1rem', 
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>📦 仓库盘点</h2>
        <button
          onClick={() => setShowHistoryModal(true)}
          style={{
            padding: '0.6rem 1.2rem',
            backgroundColor: '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          📋 盘点历史
        </button>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCategoryFilter('all')}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: categoryFilter === 'all' ? '#6b7280' : '#f3f4f6',
              color: categoryFilter === 'all' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600'
            }}
          >
            全部
          </button>
          {inventoryCategories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              style={{
                padding: '0.4rem 0.8rem',
                backgroundColor: categoryFilter === cat.key ? '#3b82f6' : '#f3f4f6',
                color: categoryFilter === cat.key ? 'white' : '#374151',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索栏 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="搜索商品名称或扫描条形码..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (e.target.value.length === 13 && /^\d+$/.test(e.target.value)) {
              handleScan(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchTerm.length === 13) {
              handleScan(searchTerm);
            }
          }}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.85rem'
          }}
        />
        <div style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
          📊 {filteredItems.length} 个商品
        </div>
        <button
          onClick={completeStocktake}
          style={{
            padding: '0.5rem 1.2rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600',
            whiteSpace: 'nowrap'
          }}
        >
          ✅ 完成盘点
        </button>
      </div>

      {/* 商品列表 */}
      <div style={{ flex: 1, backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📦</div>
              <p>暂无库存物品</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>商品名称</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>分类</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>条形码</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>单位</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>系统库存</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>盘点值</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '0.85rem', fontWeight: '600' }}>差异</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const actualCount = actualQuantities[item.id] ?? 0;
                  const difference = actualCount - item.currentStock;
                  const hasDifference = difference !== 0;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: hasDifference ? '#fef3c7' : 'white'
                      }}
                    >
                      <td style={{ padding: '0.75rem', fontWeight: '600' }}>
                        {item.name}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {(() => {
                          const cat = inventoryCategories.find(c => c.key === item.category);
                          return cat ? `${cat.icon} ${cat.name}` : item.category || '-';
                        })()}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.85rem', fontFamily: 'monospace', color: '#6b7280' }}>
                        {item.barcode || '-'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#6b7280' }}>
                        {item.unit}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#3b82f6' }}>
                        {item.currentStock}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <input
                          id={`input-${item.id}`}
                          type="number"
                          min="0"
                          step="1"
                          value={actualCount}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) ?? 0;
                            setActualQuantities(prev => ({
                              ...prev,
                              [item.id]: value
                            }));
                          }}
                          style={{
                            width: '80px',
                            padding: '0.4rem',
                            border: hasDifference ? '2px solid #f59e0b' : '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            textAlign: 'right',
                            fontSize: '0.9rem',
                            fontWeight: '600'
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {hasDifference ? (
                          <span style={{
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                            color: difference > 0 ? '#10b981' : '#ef4444'
                          }}>
                            {difference > 0 ? '+' : ''}{difference}
                          </span>
                        ) : (
                          <span style={{ color: '#10b981', fontSize: '1.2rem', fontWeight: 'bold' }}>✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 盘点历史弹窗 */}
      {showHistoryModal && (() => {
        // 每次打开时重新加载历史
        const reloadHistory = () => {
          try {
            const saved = localStorage.getItem('warehouse_stocktake_history');
            return saved ? JSON.parse(saved) : [];
          } catch {
            return [];
          }
        };
        const currentHistory = reloadHistory();
        
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              width: '90vw',
              maxWidth: '1000px',
              height: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }} className="print-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>📋 今日盘点汇总</h3>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    type="date"
                    value={selectedHistoryDate}
                    onChange={(e) => setSelectedHistoryDate(e.target.value)}
                    style={{
                      padding: '0.4rem 0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  <button
                    onClick={exportToCSV}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    📥 导出CSV
                  </button>
                  <button
                    onClick={() => window.print()}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    🖨️ 打印
                  </button>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    关闭
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(80vh - 120px)' }}>
                {(() => {
                  const filteredHistory = currentHistory.filter((record: any) => {
                    const recordDate = getLocalDateString(new Date(record.date)); // 🔥 使用本地时间
                    return recordDate === selectedHistoryDate;
                  });

                  if (filteredHistory.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
                        <p>{selectedHistoryDate === getLocalDateString() ? '今日暂无盘点记录' : `${selectedHistoryDate} 无盘点记录`}</p>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {filteredHistory.map((record: any) => {
                        return (
                          <div key={record.id} style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '0.5rem',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              padding: '1rem',
                              backgroundColor: '#f9fafb',
                              borderBottom: '1px solid #e5e7eb',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <div>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                  📦 仓库盘点
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                  {new Date(record.date).toLocaleString('zh-CN')}
                                </div>
                              </div>
                              <div style={{
                                padding: '0.4rem 0.8rem',
                                backgroundColor: record.totalDiscrepancies > 0 ? '#fef3c7' : '#d1fae5',
                                color: record.totalDiscrepancies > 0 ? '#92400e' : '#065f46',
                                borderRadius: '0.375rem',
                                fontWeight: '600'
                              }}>
                                {record.totalDiscrepancies > 0 ? `⚠️ ${record.totalDiscrepancies}个差异` : '✓ 无差异'}
                              </div>
                            </div>

                            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead style={{ backgroundColor: 'white', position: 'sticky', top: 0 }}>
                                  <tr>
                                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>商品名称</th>
                                    <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>分类</th>
                                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>单位</th>
                                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>系统库存</th>
                                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>盘点值</th>
                                    <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb' }}>差异</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {record.items.map((item: any, idx: number) => {
                                    const hasDiff = item.difference !== 0;
                                    const cat = inventoryCategories.find((c: any) => c.key === item.category);
                                    return (
                                      <tr key={idx} style={{ backgroundColor: hasDiff ? '#fef3c7' : 'white' }}>
                                        <td style={{ padding: '0.6rem', borderBottom: '1px solid #f3f4f6', fontWeight: '600' }}>
                                          {item.itemName}
                                        </td>
                                        <td style={{ padding: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                                          {cat ? `${cat.icon} ${cat.name}` : (item.category || '-')}
                                        </td>
                                        <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                                          {item.unit || ''}
                                        </td>
                                        <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: '#3b82f6' }}>
                                          {item.systemStock}
                                        </td>
                                        <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6', fontWeight: '600' }}>
                                          {item.actualStock}
                                        </td>
                                        <td style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>
                                          {hasDiff ? (
                                            <span style={{
                                              fontWeight: 'bold',
                                              fontSize: '1.1rem',
                                              color: item.difference > 0 ? '#10b981' : '#ef4444'
                                            }}>
                                              {item.difference > 0 ? '+' : ''}{item.difference}
                                            </span>
                                          ) : (
                                            <span style={{ color: '#10b981', fontSize: '1.2rem', fontWeight: 'bold' }}>✓</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// 打印样式
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @media print {
      @page {
        size: A4;
        margin: 10mm;
      }
      
      body > *:not(.print-container) {
        display: none !important;
      }
      
      .print-container {
        display: block !important;
        position: static !important;
        width: 100% !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        background: white;
        padding: 0 !important;
        margin: 0 !important;
      }
      
      /* 移除所有内部滚动 */
      .print-container div[style*="overflow"] {
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
      }
      
      /* 标题缩小 */
      .print-container h3 {
        font-size: 14pt !important;
        margin: 0 0 8px 0 !important;
      }
      
      /* 表格优化 - A4适配 */
      table {
        page-break-inside: auto;
        width: 100% !important;
        font-size: 9pt !important;
        border-collapse: collapse !important;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      thead {
        display: table-header-group;
      }
      
      td, th {
        border: 1px solid #000 !important;
        padding: 4px 6px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        font-size: 9pt !important;
      }
      
      th {
        background-color: #f3f4f6 !important;
        font-weight: bold !important;
        font-size: 9pt !important;
      }
      
      /* 差异高亮保持 */
      td span {
        font-size: 9pt !important;
      }
      
      button {
        display: none !important;
      }
      
      /* 日期选择器等隐藏 */
      input[type="date"] {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export default WarehouseStocktake;
