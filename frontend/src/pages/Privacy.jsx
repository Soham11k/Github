import { Heading, Text } from '@primer/react'
import { APP_NAME } from '../brand'
import { usePageTitle } from '../lib/pageTitle'

export default function Privacy() {
  usePageTitle('Privacy')
  return (
    <div className="page prose-page">
      <Heading as="h1">Privacy</Heading>
      <Text as="p">
        When you sign in with GitHub, {APP_NAME} stores your GitHub user id, login, and avatar URL
        so we can keep a session and save your watchlist, requests, and alerts.
      </Text>
      <Text as="p">
        We do not store your GitHub OAuth access token after login. Repository data is fetched with
        a server token and only includes public GitHub API data.
      </Text>
      <Text as="p">
        You can delete your account from the account menu (or via DELETE /api/me), which removes your
        user row and related watchlist, requests, and alerts.
      </Text>
      <Text as="p">
        Error monitoring (if enabled) is configured with send_default_pii disabled so personal
        data is not sent by default.
      </Text>
    </div>
  )
}
