# Agent Handoff

## Task
简要描述当前任务目标。不要超过 3 行。

## Current status
- Status: in_progress | blocked | ready_for_review | done
- Last agent: Codex / Claude / Cursor / human
- Branch: 当前 git branch
- Related issue/PR: 链接或编号

## Goal / acceptance criteria
- [ ] 用户真正想要的结果 1
- [ ] 用户真正想要的结果 2
- [ ] 必须通过的测试或检查

## Files touched
- `path/to/file.ts`
  - 改了什么
  - 为什么改
- `path/to/test.ts`
  - 覆盖了什么 case

## Confirmed facts
- 已经确认的事实
- 可复现的行为
- 明确定位到的代码路径

## Hypotheses / uncertain points
- 还没验证的猜测
- 可能的风险
- 需要下一个 agent 检查的地方

## Commands run
```bash
pnpm test tests/auth/redirect.test.ts
pnpm typecheck
