import { mount } from '@vue/test-utils'
import HomePage from '@/views/HomePage.vue'
import { describe, expect, test } from 'vitest'

describe('HomePage.vue', () => {
  test('renders the welcome screen with the destination button', () => {
    const wrapper = mount(HomePage)
    expect(wrapper.find('h1').text()).toContain('Find your way')
    expect(wrapper.find('img.welcome-logo').attributes('src')).toBe('/images/1locate-logo.png')
    expect(wrapper.text()).toContain('Choose Destination')
  })
})
