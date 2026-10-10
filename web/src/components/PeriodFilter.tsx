import { t } from '../i18n'
import { type DateRange, EMPTY_RANGE, hasRange, isRangeInverted } from '../lib/period'

interface PeriodFilterProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const inverted = isRangeInverted(value)

  return (
    <fieldset className="period-filter">
      <legend>{t.period.legend}</legend>
      <label>
        {t.period.from}
        <input
          type="date"
          value={value.from}
          max={value.to || undefined}
          aria-invalid={inverted}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </label>
      <label>
        {t.period.to}
        <input
          type="date"
          value={value.to}
          min={value.from || undefined}
          aria-invalid={inverted}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </label>
      {hasRange(value) && (
        <button type="button" className="period-clear" onClick={() => onChange(EMPTY_RANGE)}>
          {t.period.clear}
        </button>
      )}
      {inverted && (
        <p className="form-error" role="alert">
          {t.period.inverted}
        </p>
      )}
    </fieldset>
  )
}
