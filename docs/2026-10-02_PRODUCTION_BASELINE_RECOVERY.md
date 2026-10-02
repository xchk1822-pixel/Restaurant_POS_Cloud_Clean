# 2026-10-02 生产基线恢复

## 原因

- 桌面原工作目录已不存在。
- GitHub `main` 最后提交停留在 2026-07-12，缺少之后已经上线的生产代码。
- 当前线上 Hosting 使用 `main.132e2e45.js`，不能直接从旧 GitHub 基线部署。

## 恢复来源

- 使用 `Xing_Long_Restaurant` 的首个基线提交 `fb96545`。
- 该提交在 2026-09-26 从当时的 `Restaurant_POS_Cloud_Clean` 生产工作区建立。
- 保留原项目 Firebase 配置和项目标识 `restaurant-pos-1b420`。
- GitHub 旧基线已保存到分支 `archive/github-baseline-2026-07-12`。

## 独立验证

- 恢复后生产构建通过。
- 本地 bundle：`main.154ed8b6.js`。
- 线上 bundle：`main.132e2e45.js`。
- 排除构建自动生成的 JS 文件名和相同 SVG 的行尾哈希差异后：
  - 本地长度：`2233006`
  - 线上长度：`2233006`
  - 内容比较：完全一致

## 结论

桌面目录 `C:\Users\华为\Desktop\Restaurant_POS_Cloud_Clean` 已恢复为当前线上生产源码基线。后续修改必须从该基线继续，禁止使用 2026-07-12 的旧代码直接部署。
