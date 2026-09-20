import { REPO_URL, RULES_URL } from '../config'
import { useTheme } from '../lib/theme'
import { CodeIcon, MailIcon, ScrollIcon, SunIcon } from './icons'

const CONTACTS = [
  { label: 'sychchou@gmail.com', href: 'mailto:sychchou@gmail.com', icon: <MailIcon /> },
  { label: 'github', href: REPO_URL, icon: <CodeIcon /> },
  { label: 'rules', href: RULES_URL, icon: <ScrollIcon /> },
]

/**
 * The footer line: every way to reach a person, the terms in full, and the one setting there is
 * — small, at the bottom, where things that are permanent but rarely wanted belong.
 */
export function Contact() {
  const [theme, toggleTheme] = useTheme()
  // Laid out rather than punctuated: the items are inline-flex, and inline-flex eats the spaces
  // around a written separator unevenly.
  return (
    <p className="contact">
      {CONTACTS.map((contact, i) => (
        <span className="contact-item" key={contact.label}>
          {i > 0 && <span aria-hidden="true">·</span>}
          <a href={contact.href} target="_blank" rel="noopener noreferrer">
            {contact.icon}
            {contact.label}
          </a>
        </span>
      ))}
      <span className="contact-item">
        <span aria-hidden="true">·</span>
        <button
          type="button"
          className="contact-toggle"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={toggleTheme}
        >
          <SunIcon />
          {theme === 'dark' ? 'light' : 'dark'}
        </button>
      </span>
    </p>
  )
}
