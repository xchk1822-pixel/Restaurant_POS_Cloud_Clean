# 员工借款与营业款管理系统 - 数据流说明

## 🎯 核心业务逻辑

### 1. 借款流程
```
员工申请借款 
    ↓
从收银台营业款中扣除现金
    ↓
记录借款流水（cash_flow_records）
    ↓
创建借款记录（loan_records）
    ↓
交班时：实交现金 = 系统营业额 - 借款总额
    ↓
薪资结算时：自动从工资中扣回借款
```

### 2. 还款流程
```
员工现金还款
    ↓
现金回到收银台
    ↓
记录还款流水（cash_flow_records）
    ↓
更新借款记录剩余金额
    ↓
交班时：实交现金增加
```

---

## 📊 数据模块关联

### POS系统 (pos_orders)
- **提供数据**：订单营业额、支付方式
- **关键字段**：total, paymentMethod, cashAmount, cardAmount

### 交班对账 (rest_v6_final)
- **提供数据**：实交现金、差异分析
- **计算公式**：
  ```
  应存现金 = POS现金收入
  实交现金 = 实际清点现金
  差异 = 实交 - 应存
  借款影响 = 所有未还借款总额
  ```

### 员工管理 (employees)
- **提供数据**：员工基本信息、社保配置
- **关键字段**：baseSalary, socialSecurityBase, socialSecurityRate

### 考勤系统 (attendance_records)
- **提供数据**：工时、加班时长
- **计算**：加班费 = 加班时长 × 时薪 × 1.5

### 借款管理 (loan_records)
- **提供数据**：借款金额、剩余欠款
- **影响**：营业款扣除、薪资扣款

### 现金流记录 (cash_flow_records) ⭐新增
- **作用**：追踪所有营业款变动
- **类型**：
  - `loan_out` - 借款支出
  - `loan_repay` - 还款收入
  - `salary_payment` - 薪资发放
  - `other` - 其他

---

## 💰 营业款计算逻辑

### 每日营业款公式
```
理论现金 = POS现金收款总额
借款支出 = SUM(当日新增借款)
还款收入 = SUM(当日还款)
其他支出 = 开支记录

实有现金 = 理论现金 - 借款支出 + 还款收入 - 其他支出
```

### 交班对账公式
```
应存现金 = 理论现金
已借出 = 借款支出
应收回 = 还款收入
应交现金 = 应存现金 - 已借出 + 应收回

实交现金 = 实际清点
差异 = 实交 - 应交
```

---

## 🔄 数据同步机制

### 1. 借款时自动执行
```typescript
// 1. 创建借款记录
loanRecords.push(newLoan)

// 2. 记录现金流
cashFlowRecords.push({
  type: 'loan_out',
  amount: loanAmount,
  description: '借款给XXX'
})

// 3. 保存到localStorage
localStorage.setItem('loan_records', ...)
localStorage.setItem('cash_flow_records', ...)
```

### 2. 还款时自动执行
```typescript
// 1. 更新借款记录
loan.remainingAmount -= repayAmount

// 2. 记录现金流
cashFlowRecords.push({
  type: 'loan_repay',
  amount: repayAmount,
  description: 'XXX还款'
})

// 3. 保存
```

### 3. 交班时自动计算
```typescript
// 从各模块读取数据
const posOrders = JSON.parse(localStorage.getItem('pos_orders'))
const loans = JSON.parse(localStorage.getItem('loan_records'))
const cashFlows = JSON.parse(localStorage.getItem('cash_flow_records'))

// 计算当日借款总额
const todayLoans = cashFlows.filter(f => 
  f.type === 'loan_out' && f.date === today
).reduce((sum, f) => sum + f.amount, 0)

// 计算当日还款总额
const todayRepays = cashFlows.filter(f => 
  f.type === 'loan_repay' && f.date === today
).reduce((sum, f) => sum + f.amount, 0)

// 计算应交现金
const expectedCash = posCashIncome - todayLoans + todayRepays
```

### 4. 薪资结算时自动扣款
```typescript
// 获取员工剩余借款
const remainingLoan = getRemainingLoan(employeeId)

// 计算本月应还（最多30%工资）
const loanRepayment = Math.min(remainingLoan, baseSalary * 0.3)

// 生成工资单
salaryRecord = {
  baseSalary: ...,
  loanRepayment: loanRepayment,
  actualSalary: baseSalary - socialSecurity - loanRepayment
}

// 如果现金还款，记录现金流
if (repaymentMethod === 'cash_repayment') {
  recordCashFlow({
    type: 'salary_payment',
    amount: loanRepayment,
    description: `${name}工资中扣除借款`
  })
}
```

---

## 📋 使用场景示例

### 场景1：员工借款
```
时间：2024-04-10 14:00
员工：张三
金额：C$ 500
用途：生活急用

操作流程：
1. 店长在"借款管理"中添加借款
2. 系统自动从收银台取出C$500给张三
3. 记录借款流水
4. POS系统显示今日现金收入减少C$500

数据变化：
- loan_records: 新增一条借款记录
- cash_flow_records: 新增 loan_out 记录
- 收银台现金: -C$500
```

### 场景2：员工还款
```
时间：2024-04-12 10:00
员工：张三
金额：C$ 200

操作流程：
1. 张三明现金还给收银台C$200
2. 店长在"借款管理"中记录还款
3. 系统记录还款流水
4. POS系统显示今日现金收入增加C$200

数据变化：
- loan_records: 剩余欠款从C$500变为C$300
- cash_flow_records: 新增 loan_repay 记录
- 收银台现金: +C$200
```

### 场景3：交班对账
```
时间：2024-04-10 22:00

POS数据显示：
- 今日营业额：C$ 5,000
- 现金收款：C$ 3,000
- 刷卡收款：C$ 2,000

借款情况：
- 今日借出：C$ 500（张三）
- 今日收回：C$ 0

计算：
- 应存现金：C$ 3,000
- 已借出：C$ 500
- 应交现金：C$ 3,000 - C$ 500 = C$ 2,500

实际清点：C$ 2,480
差异：C$ 2,480 - C$ 2,500 = -C$ 20（短款）
```

### 场景4：薪资结算
```
员工：张三
结算周期：2024-04-01 至 2024-04-30

数据汇总：
- 基本工资：C$ 3,000
- 加班费：C$ 200
- 社保个人：C$ 315（10.5%）
- 剩余借款：C$ 300
- 本月扣款：C$ 300（10%工资）

计算：
应发工资 = C$ 3,000 + C$ 200 = C$ 3,200
扣款总额 = C$ 315 + C$ 300 = C$ 615
实发工资 = C$ 3,200 - C$ 615 = C$ 2,585

操作：
1. 系统自动生成工资单
2. 标记借款C$300已从工资扣除
3. 剩余借款：C$ 0（已还清）
4. 记录薪资发放流水
```

---

## 🎨 界面展示建议

### 借款管理页面
```
┌─────────────────────────────────────────────┐
│ 💸 借款管理                  [➕新增借款]   │
├─────────────────────────────────────────────┤
│ 📊 今日现金流                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │借出 C$500│ │收回 C$200│ │净支出C$300│    │
│ └──────────┘ └──────────┘ └──────────┘    │
├─────────────────────────────────────────────┤
│ 活跃借款列表                                │
│ 员工 | 金额 | 剩余 | 日期 | 用途 | [还款]  │
│ -----|------|------|------|------|--------│
│ 张三 | C$500| C$300|04-10 |急用  |[💵还款]│
└─────────────────────────────────────────────┘
```

### 交班对账页面（增强）
```
┌─────────────────────────────────────────────┐
│ 📋 交班对账                                 │
├─────────────────────────────────────────────┤
│ POS数据：                                   │
│   营业额：C$ 5,000                          │
│   现金：C$ 3,000                            │
│   刷卡：C$ 2,000                            │
├─────────────────────────────────────────────┤
│ 借款影响：                                  │
│   今日借出：C$ 500 🔴                       │
│   今日收回：C$ 200 🟢                       │
│   净影响：-C$ 300                           │
├─────────────────────────────────────────────┤
│ 对账结果：                                  │
│   应存现金：C$ 3,000                        │
│   减：已借出：C$ 500                        │
│   加：已收回：C$ 200                        │
│   应交现金：C$ 2,700                        │
│   实交现金：C$ 2,680                        │
│   差  异：-C$ 20 ⚠️                         │
└─────────────────────────────────────────────┘
```

---

## 🔧 技术实现要点

### 1. 数据一致性
- 所有模块从localStorage读取最新数据
- 每次操作后立即保存并通知其他模块
- 使用统一的数据格式和时间戳

### 2. 审计追踪
- cash_flow_records记录每一笔营业款变动
- 支持追溯任意时间点的资金流向
- 便于财务对账和问题排查

### 3. 权限控制
- 借款需要店长权限
- 还款需要确认
- 所有操作记录操作人和时间

### 4. 数据备份
- 定期导出JSON备份
- 支持历史数据恢复
- 云端同步（可选）

---

## 📝 总结

这个系统的核心思想是：
1. **借款从营业款出** - 不是额外资金，而是占用当日营收
2. **数据自动流动** - 各模块数据互通，无需手动录入
3. **全程可追溯** - 每笔资金变动都有记录
4. **智能计算** - 交班、薪资自动考虑借款因素

这样设计的好处：
- ✅ 账目清晰，不会混乱
- ✅ 减少人工错误
- ✅ 提高对账效率
- ✅ 方便财务管理
