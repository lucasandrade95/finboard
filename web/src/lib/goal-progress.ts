export interface GoalProgressInput {
  targetCents: number
  savedCents: number
  deadline: string | null
}

export interface GoalProgress {
  /** Percentual real do guardado sobre o alvo, sem teto (120 quando passou da meta). */
  percent: number
  /** Largura da barra, saturada em 100. */
  barPercent: number
  /** Quanto falta para o alvo, em centavos; 0 quando alcançada. */
  remainingCents: number
  done: boolean
  /** Prazo já passou sem a meta ter sido alcançada. */
  overdue: boolean
  /** Meses até o prazo (mínimo 1 enquanto não vence); null sem prazo ou vencida. */
  monthsLeft: number | null
  /** Quanto guardar por mês para chegar no prazo; null sem prazo, vencida ou concluída. */
  monthlyNeededCents: number | null
}

// Diferença em meses de calendário, sem Date: mês do prazo menos mês de hoje.
// Prazo no mesmo mês conta como 1 (ainda dá para guardar este mês).
function monthsBetween(today: string, deadline: string): number {
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const [deadlineYear, deadlineMonth] = deadline.split('-').map(Number)
  const diff =
    ((deadlineYear ?? 0) - (todayYear ?? 0)) * 12 + (deadlineMonth ?? 0) - (todayMonth ?? 0)
  return Math.max(1, diff)
}

export function goalProgress(goal: GoalProgressInput, today: string): GoalProgress {
  const percent = Math.round((goal.savedCents / goal.targetCents) * 100)
  const remainingCents = Math.max(0, goal.targetCents - goal.savedCents)
  const done = remainingCents === 0
  // Comparação de string funciona porque as datas são ISO (YYYY-MM-DD).
  const overdue = !done && goal.deadline !== null && goal.deadline < today
  const monthsLeft = goal.deadline === null || overdue ? null : monthsBetween(today, goal.deadline)
  const monthlyNeededCents =
    monthsLeft === null || done ? null : Math.ceil(remainingCents / monthsLeft)

  return {
    percent,
    barPercent: Math.min(100, percent),
    remainingCents,
    done,
    overdue,
    monthsLeft,
    monthlyNeededCents,
  }
}
