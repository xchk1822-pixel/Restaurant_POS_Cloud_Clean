# 员工管理模块结构说明

## 📁 文件结构

```
Employees/
├── Employees.tsx                 # 主入口文件（整合所有子组件）
├── EmployeeList.tsx              # 员工档案管理组件
├── AttendanceManagement.tsx      # 考勤管理组件
├── LoanManagement.tsx            # 借款管理组件
├── SalarySettlement.tsx          # 薪资结算组件
└── README.md                     # 本说明文档
```

## 🎯 组件职责划分

### 1. **Employees.tsx** - 主入口文件
- **职责**：整合所有子组件，管理全局状态和数据加载
- **功能**：
  - 通过路由路径切换子模块（`/employees/xxx`）
  - localStorage 数据加载和持久化
  - 向子组件传递共享数据
  - 响应侧边栏子菜单点击
- **注意**：顶部无Tab按钮，完全依赖左侧导航切换

### 2. **EmployeeList.tsx** - 员工档案管理
- **职责**：员工的增删改查
- **功能**：
  - 员工列表展示
  - 添加/编辑员工信息
  - 删除员工
  - 薪资配置（日薪、加班费、福利、社保等）

### 3. **AttendanceManagement.tsx** - 考勤管理
- **职责**：员工打卡和考勤记录
- **功能**：
  - 快速打卡（上班/下班）
  - 考勤记录查询
  - 工时计算
  - 按日期筛选考勤记录

### 4. **LoanManagement.tsx** - 借款管理
- **职责**：员工借款记录和现金流管理
- **功能**：
  - 新增借款
  - 借款统计（活跃笔数、总额、未还总额）
  - 借款列表展示
  - 现金流记录（借款支出）

### 5. **SalarySettlement.tsx** - 薪资结算
- **职责**：薪资计算和发放
- **功能**：
  - 自定义时间段薪资结算
  - 自动计算基本工资、加班费、社保
  - 借款自动扣除（不超过工资30%）
  - 薪资历史记录查询
  - 现金流记录（薪资扣款）

## 🔄 数据流

```
侧边栏子菜单点击
  ↓
路径变化 (/employees/attendance)
  ↓
Employees.tsx (主入口)
  ├─ 读取当前路径
  ├─ 加载 localStorage 数据
  ├─ 维护全局状态
  └─ 传递给子组件
       ├─ EmployeeList ← employees, setEmployees
       ├─ AttendanceManagement ← attendanceRecords, setAttendanceRecords
       ├─ LoanManagement ← loanRecords, cashFlowRecords
       └─ SalarySettlement ← salaryRecords, attendanceRecords, loanRecords
```

## 💾 数据存储

所有数据存储在 `localStorage` 中：

| 键名 | 数据类型 | 说明 |
|------|---------|------|
| `employees` | Employee[] | 员工档案 |
| `attendance_records` | AttendanceRecord[] | 考勤记录 |
| `employee_schedules` | Schedule[] | 排班记录（预留） |
| `salary_records` | SalaryRecord[] | 薪资记录 |
| `loan_records` | LoanRecord[] | 借款记录 |
| `cash_flow_records` | CashFlowRecord[] | 现金流记录 |

## 🔧 维护和扩展

### 添加新功能
1. 在对应子组件中添加功能代码
2. 如需新状态，在 `Employees.tsx` 中添加并传递给子组件
3. 如需新子模块：
   - 创建新的组件文件（如 `PerformanceReview.tsx`）
   - 在 `MainLayout.tsx` 的菜单配置中添加子菜单项
   - 在 `Employees.tsx` 中导入并添加条件渲染
   - 路径格式：`/employees/新功能名`

**注意**：不需要在 Employees.tsx 中添加Tab按钮，完全依赖左侧导航

### 修改现有功能
- 每个子组件独立维护，互不影响
- 只需修改对应的 `.tsx` 文件即可

### 示例：添加“绩效考核”功能
```typescript
// 1. 创建 PerformanceReview.tsx

// 2. 在 MainLayout.tsx 中添加子菜单
{ path: '/employees/performance', icon: '📊', label: '绩效考核' }

// 3. 在 Employees.tsx 中导入
import PerformanceReview from './PerformanceReview';

// 4. 在 getPathTab 函数中添加判断
if (path.includes('/performance')) return 'performance';

// 5. 在 handleTabChange 的 paths 对象中添加
const paths = {
  // ...
  performance: '/employees/performance'
};

// 6. 在 Employees.tsx 中添加条件渲染
{activeTab === 'performance' && <PerformanceReview ... />}
```

**注意**：不需要添加Tab按钮，用户通过左侧导航访问

## ✨ 优势

1. **模块化**：每个功能独立，便于维护
2. **可复用**：子组件可在其他地方复用
3. **易测试**：每个组件可单独测试
4. **清晰职责**：代码结构一目了然
5. **团队协作**：多人可同时开发不同模块

## 📝 注意事项

- 所有组件共享相同的 TypeScript 类型定义
- 数据持久化统一在 `Employees.tsx` 中处理
- 子组件通过 props 接收数据和更新函数
- 避免在子组件中直接操作 localStorage
