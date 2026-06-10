import React from 'react';
import ShiftHandoverModule from './ShiftHandover';

// 交班对账 - 嵌入式版本（去掉外层容器）
const ShiftHandoverEmbedded: React.FC = () => {
  return (
    <div>
      <ShiftHandoverModule />
    </div>
  );
};

export default ShiftHandoverEmbedded;
