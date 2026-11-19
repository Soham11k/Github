import { Heading, Text } from '@primer/react'
import { APP_DISCLAIMER, APP_NAME, APP_TAGLINE } from '../brand'
import { usePageTitle } from '../lib/pageTitle'

export default function About() {
  usePageTitle('About')
  return (
    <div className="page prose-page">
      <Heading as="h1">About {APP_NAME}</Heading>
      <Text as="p">{APP_TAGLINE}</Text>
      <Text as="p">
        {APP_NAME} analyzes public GitHub repositories with PostgreSQL views, materialized
        summaries, and recursive CTEs — then surfaces health, beginner-friendly issues, and
        organization trends in a Primer-based UI.
      </Text>
      <Text as="p">{APP_DISCLAIMER}</Text>
      <Text as="p">
        Sign in with GitHub to request repos for ingest, save a watchlist, and receive in-app
        alerts when health changes. Ingest and admin tools remain restricted to operators.
      </Text>
    </div>
  )
}
