---
name: design-goals
description: Keep solutions simple and elegant, and require CloudFormation for all infrastructure changes.
compatibility: opencode, aws, cloudformation
metadata:
  audience: agents-and-humans
  version: "1.0.0"
---

# Design Goals Skill

## When to use

Use this skill for any work that involves design tradeoffs, architecture choices, or infrastructure updates.

## Core goals

1. Prefer simple and elegant solutions.
2. Reduce complexity and moving parts.
3. Favor clear and maintainable patterns over clever ones.
4. Deploy every infrastructure change through CloudFormation.

## Infrastructure policy

- Define infra changes in CloudFormation templates first.
- Deploy infra changes with CloudFormation stack operations.
- Do not rely on manual console changes for persistent infra.
- Keep infra changes reviewable and reproducible in code.

## Decision checklist

Before finalizing changes, confirm all are true:

- The solution is the simplest option that satisfies requirements.
- The design remains readable and elegant.
- Any infra change is represented and deployed via CloudFormation.

## Done criteria

- Implementation is simple, clear, and elegant.
- Infra changes are captured in CloudFormation templates.
- Infra deployment path uses CloudFormation only.
