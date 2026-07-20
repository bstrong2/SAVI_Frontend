import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LogPanel from './LogPanel.vue'

describe('LogPanel', () => {
  // Test that each log entry renders as its own row containing the timestamp and message text.
  it('renders a row per entry with timestamp and message', () => {
    const entries = [
      { timestamp: '12:00:00', message: 'Started', level: 'Info' },
      { timestamp: '12:00:01', message: 'Something happened', level: 'Warning' },
    ]

    const wrapper = mount(LogPanel, { props: { entries, autoScroll: false } })
    const rows = wrapper.findAll('.log-row')

    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('12:00:00')
    expect(rows[0].text()).toContain('Started')
    expect(rows[1].text()).toContain('Something happened')
  })

  // Test that the row's CSS class reflects the entry's severity level... Example: Error -> level-error
  it('applies a severity class derived from the entry level', () => {
    const entries = [{ timestamp: '12:00:00', message: 'boom', level: 'Error' }]

    const wrapper = mount(LogPanel, { props: { entries, autoScroll: false } })

    expect(wrapper.find('.log-row').classes()).toContain('level-error')
  })

  // Test that an entry without a level defaults to the info severity class.
  it('falls back to the info level when an entry has no level', () => {
    const entries = [{ timestamp: '12:00:00', message: 'no level here' }]

    const wrapper = mount(LogPanel, { props: { entries, autoScroll: false } })

    expect(wrapper.find('.log-row').classes()).toContain('level-info')
  })

  // Test that an empty entries array renders no rows.
  it('renders no rows for an empty log', () => {
    const wrapper = mount(LogPanel, { props: { entries: [], autoScroll: false } })

    expect(wrapper.findAll('.log-row')).toHaveLength(0)
  })
})
