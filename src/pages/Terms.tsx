import { useEffect } from 'react'
import { Link } from 'react-router'
import { Logo } from '../components/Logo'
import { BRAND } from '../lib/brand'

/** Plain document page. */
export function Terms() {
  useEffect(() => {
    const previous = document.title
    document.title = `Terms · ${BRAND}`
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="doc-page">
      <header>
        <Link className="doc-nav" to="/">
          <Logo className="doc-logo" />
          <span>{BRAND}</span>
        </Link>
      </header>

      <main>
        <h1>Terms</h1>
        <p className="doc-date">Effective November 19, 2026</p>

        <h2>What {BRAND} is</h2>
        <p>
          {BRAND} is a bookmark manager that borrows git's words. You save links as
          "commits" and organize them into "branches." It is built by{' '}
          <a
            href="https://github.com/kojoarhinful"
            target="_blank"
            rel="noopener"
          >
            @kojoarhinful
          </a>{' '}
          and{' '}
          <a href="https://github.com/rasmusyartey" target="_blank" rel="noopener">
            @rasmusyartey
          </a>
          .
        </p>
        <p>
          {BRAND} is open source. You can read the code at{' '}
          <a
            href="https://github.com/kojoarhinful/dotlog"
            target="_blank"
            rel="noopener"
          >
            github.com/kojoarhinful/dotlog
          </a>
          .
        </p>

        <h2>Using {BRAND}</h2>
        <p>
          You can use {BRAND} if you follow these terms and the law. You need an
          account, and you're responsible for what happens on it.
        </p>

        <h2>Your data is yours</h2>
        <p>
          Your titles, links, notes, tags, and branch names belong to you. We store
          them only in encrypted form. We don't sell them, and we can't read them.
        </p>
        <p>
          Only the contents are encrypted. The server can see your email address,
          when your account was created, when each record was last changed, and how
          many records you have. It cannot see what you save: titles, links, notes,
          or branch names.
        </p>
        <p>
          Passwords are stretched with PBKDF2-SHA256 (600,000 iterations), and every
          record is encrypted with AES-256-GCM using the browser's Web Crypto API.
          The algorithms and iteration counts are named here so the claim can be
          checked.
        </p>
        <p>
          To keep you signed in, your unlocked key stays in this browser until you
          sign out. It is stored as a non-extractable key, so page code can use it
          but cannot copy it out. Anyone with access to your unlocked browser could
          use it.
        </p>

        <h2>Please read this part: we can't recover your data</h2>
        <p>
          Your log is encrypted with a key that only your password and your
          recovery code can unlock. If you lose both, your data is gone for good.
          We can't reset it, bypass it, or get it back for you. Keep your recovery
          code somewhere safe and offline. Anyone who has your recovery code can
          open your archive.
        </p>

        <h2>Fetch (link previews)</h2>
        <p>
          Fetch is optional. When you use it, your browser sends the link to our
          server, which opens the page to read its title and icon. Cloudflare
          handles that request, so Cloudflare sees the link while it is being read.
          We don't store it, sell it, or use it to track you, and we can't tell
          whether you went on to save that link. To prevent abuse, we keep a
          short-lived counter keyed by a hash of your IP address. Don't use Fetch
          to attack, scan, or overload other sites or our servers, or to reach
          private or internal addresses. Don't use {BRAND} to store or share
          anything illegal.
        </p>
        <p>
          The icon is read once when you use Fetch, then stored with the bookmark in
          encrypted form. When your log loads, your browser does not contact the
          sites you saved. Opening a bookmark still visits that site, of course.
        </p>

        <h2>Sign-in email</h2>
        <p>
          We send sign-in codes by email. Keep your inbox secure, because anyone
          with access to it may be able to get into your account.
        </p>

        <h2>Deleting your account</h2>
        <p>
          You can delete your account any time from Profile → Delete account. We
          email a code to confirm it is you, then your data is removed immediately,
          except that database backups may keep encrypted copies for up to 30 days.
        </p>

        <h2>Tools we use</h2>
        <p>
          Cloudflare hosts the app and the database and handles Fetch requests.
          GitHub hosts the code and deploys the app. Brevo sends sign-in email. Each
          has its own terms:{' '}
          <a
            href="https://www.cloudflare.com/website-terms/"
            target="_blank"
            rel="noopener"
          >
            Cloudflare
          </a>
          ,{' '}
          <a
            href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"
            target="_blank"
            rel="noopener"
          >
            GitHub
          </a>
          , and{' '}
          <a
            href="https://www.brevo.com/legal/termsofuse/"
            target="_blank"
            rel="noopener"
          >
            Brevo
          </a>
          . Their infrastructure necessarily processes IP addresses, your email
          address, and encrypted data.
        </p>

        <h2>Our right to suspend</h2>
        <p>
          We may suspend or remove an account that abuses the service, attacks our
          systems, or breaks the law. If we can reasonably warn you first, we will.
        </p>

        <h2>No guarantees</h2>
        <p>
          {BRAND} is provided "as is." It's a small project and may have bugs,
          downtime, or changes. Please keep your own backup of anything important.
          To the extent the law allows, we aren't liable for lost data, lost access,
          or other losses from using the service.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms. We'll change the date above, and for big
          changes we'll tell you in the app or by email.
        </p>

        <h2>Contact</h2>
        <p>
          <a href="mailto:elevatedfriends@gmail.com">elevatedfriends@gmail.com</a>
        </p>

        <h2>Governing law</h2>
        <p>These terms are governed by the laws of Ghana.</p>
      </main>

      <footer>
        <p>
          built by{' '}
          <a
            href="https://github.com/kojoarhinful"
            target="_blank"
            rel="noopener"
          >
            @kojoarhinful
          </a>{' '}
          &amp;{' '}
          <a href="https://github.com/rasmusyartey" target="_blank" rel="noopener">
            @rasmusyartey
          </a>
        </p>
        <p>&copy; 2026 {BRAND}</p>
      </footer>
    </div>
  )
}
