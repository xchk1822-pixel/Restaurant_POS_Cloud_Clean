import React, { useState } from 'react';

interface Table {
  id: string;
  number: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: 'available' | 'occupied' | 'reserved' | 'needs_cleaning';
  capacity: number;
}

interface TableLayoutProps {
  tables: Table[];
  selectedTableId: string | null;
  onTableSelect: (tableId: string) => void;
  onTablesUpdate: (tables: Table[]) => void;
}

const TableLayout: React.FC<TableLayoutProps> = ({
  tables,
  selectedTableId,
  onTableSelect,
  onTablesUpdate
}) => {
  const [draggedTable, setDraggedTable] = useState<string | null>(null);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number; tableId: string } | null>(null);

  const handleMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (e.button === 2) return; // 右键不拖动
    setDraggedTable(tableId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedTable) return;

    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left - 40; // 居中
    const y = e.clientY - rect.top - 20;

    const updatedTables = tables.map(table =>
      table.id === draggedTable
        ? { ...table, x: Math.max(0, x), y: Math.max(0, y) }
        : table
    );

    onTablesUpdate(updatedTables);
  };

  const handleMouseUp = () => {
    setDraggedTable(null);
  };

  const handleContextMenu = (e: React.MouseEvent, tableId: string) => {
    e.preventDefault();
    setShowContextMenu({
      x: e.clientX,
      y: e.clientY,
      tableId
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#10b981';
      case 'occupied': return '#ef4444';
      case 'reserved': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const handleMergeTables = () => {
    // 合并桌子逻辑
    alert('合并桌子功能');
    setShowContextMenu(null);
  };

  const handleSplitTable = () => {
    // 拆分桌子逻辑
    alert('拆分桌子功能');
    setShowContextMenu(null);
  };

  return (
    <div style={{ position: 'relative', height: '100%', backgroundColor: '#f9fafb', borderRadius: '0.5rem', overflow: 'hidden' }}>
      <div
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        {tables.map(table => (
          <div
            key={table.id}
            onMouseDown={(e) => handleMouseDown(e, table.id)}
            onContextMenu={(e) => handleContextMenu(e, table.id)}
            onClick={() => onTableSelect(table.id)}
            style={{
              position: 'absolute',
              left: table.x,
              top: table.y,
              width: table.width,
              height: table.height,
              backgroundColor: selectedTableId === table.id ? '#3b82f6' : getStatusColor(table.status),
              borderRadius: '0.5rem',
              cursor: 'move',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              boxShadow: selectedTableId === table.id ? '0 0 0 3px #60a5fa' : '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'box-shadow 0.2s',
              userSelect: 'none'
            }}
          >
            <div style={{ fontSize: '1.25rem' }}>{table.number}</div>
            <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{table.capacity}人</div>
          </div>
        ))}
      </div>

      {/* 右键菜单 */}
      {showContextMenu && (
        <div
          style={{
            position: 'fixed',
            left: showContextMenu.x,
            top: showContextMenu.y,
            backgroundColor: 'white',
            borderRadius: '0.375rem',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            zIndex: 1000,
            minWidth: '150px'
          }}
        >
          <button
            onClick={handleMergeTables}
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              textAlign: 'left',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            合并桌子
          </button>
          <button
            onClick={handleSplitTable}
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              textAlign: 'left',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            拆分桌子
          </button>
        </div>
      )}

      {/* 图例 */}
      <div style={{
        position: 'absolute',
        bottom: '1rem',
        left: '1rem',
        backgroundColor: 'white',
        padding: '0.75rem',
        borderRadius: '0.375rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        fontSize: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#10b981', borderRadius: '2px', marginRight: '0.5rem' }}></div>
          <span>空闲</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#ef4444', borderRadius: '2px', marginRight: '0.5rem' }}></div>
          <span>占用</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: '#f59e0b', borderRadius: '2px', marginRight: '0.5rem' }}></div>
          <span>预订</span>
        </div>
      </div>
    </div>
  );
};

export default TableLayout;
