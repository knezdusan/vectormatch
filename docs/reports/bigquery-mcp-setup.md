# BigQuery MCP Setup Guide for VectorMatch

## Overview
This guide covers the setup and usage of Google BigQuery MCP (Model Context Protocol) integration for the VectorMatch project, specifically configured for Devin Desktop.

## Purpose
BigQuery MCP enables AI-assisted querying and analysis of public datasets (HTTP Archive, Hacker News, etc.) used in Module B (Seeding & Ingestion Engine) for discovering job boards and candidate companies at zero cost.

## Prerequisites

### Google Cloud Setup
- **Google Cloud Project**: Create or select a project (can be new/empty)
- **BigQuery API**: Enable the BigQuery API in your project
- **Authentication**: Configure Application Default Credentials (ADC)
- **Billing**: Not required for BigQuery Sandbox tier with public datasets

### BigQuery Sandbox Tier Benefits
- **No billing setup required** for public dataset access
- **1 TB/month free query processing** for public datasets
- **Perfect for development** and exploration phases
- **Automatic enrollment** when creating a new project

## Devin Desktop Configuration

### MCP Server Configuration
The BigQuery MCP server is already configured in `.devin/config.json`:

```json
{
  "mcpServers": {
    "bigquery": {
      "transport": "STDIO",
      "command": "npx",
      "args": ["-y", "@toolbox-sdk/server", "--prebuilt", "bigquery", "--stdio"],
      "env": {
        "BIGQUERY_PROJECT": "your-project-id"
      }
    }
  }
}
```

### Environment Variables
Replace `your-project-id` with your actual Google Cloud project ID. This can be:
- Set directly in the config for development
- Loaded from environment variables for production
- Different per environment (dev/staging/prod)

### Authentication Setup

#### Option 1: Application Default Credentials (Recommended for Development)
```bash
# Install Google Cloud SDK if not already installed
# Authenticate with your Google account
gcloud auth application-default login

# Verify authentication
gcloud auth application-default print-access-token
```

#### Option 2: Service Account (Production)
```bash
# Create service account in Google Cloud Console
# Download JSON key file
# Set GOOGLE_APPLICATION_CREDENTIALS environment variable
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/keyfile.json"
```

## Available MCP Tools

Once configured, these tools are available to Devin:

### Core Query Tools
- **`execute_sql`**: Execute raw SQL statements against BigQuery
- **`ask_data_insights`**: Natural language data analysis and complex queries
- **`search_catalog`**: Find tables using natural language search

### Metadata Tools
- **`get_table_info`**: Retrieve table metadata and schema
- **`get_dataset_info`**: Get dataset metadata
- **`list_table_ids`**: List all tables in a dataset
- **`list_dataset_ids`**: List all datasets in the project

### Analytics Tools
- **`analyze_contribution`**: Perform key driver analysis
- **`forecast`**: Time series forecasting

## VectorMatch-Specific Use Cases

### Module B: Seeding & Ingestion Engine

#### 1. HTTP Archive BigQuery Data Discovery
Use `ask_data_insights` to analyze job posting patterns:
```
"Show me the top 10 most requested JavaScript frameworks in job postings from the last 30 days"
```

#### 2. Hacker News Data Integration
Query HN job postings and company mentions:
```sql
SELECT 
  title,
  url,
  score,
  timestamp
FROM `bigquery-public-data.hacker_news.stories`
WHERE type = 'job'
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
ORDER BY score DESC
LIMIT 50
```

#### 3. SSL Certificate Discovery
Find companies using SSL certificate data:
```
"Find companies with recent SSL certificate registrations in the tech sector"
```

### Performance Monitoring
- Query matching funnel metrics across the 3 gates
- Analyze vector similarity performance
- Track ingestion pipeline efficiency

### Market Intelligence
- Identify trending tech skills in job postings
- Forecast job posting volumes by sector/region
- Analyze competitive landscape

## Usage Patterns

### Natural Language Queries
Leverage `ask_data_insights` for exploratory analysis:
```
"What are the most common combinations of React and Node.js in job postings?"
"Show me companies that have posted more than 5 jobs in the last month"
"Analyze the geographic distribution of remote job postings"
```

### Schema Discovery
Use `search_catalog` to find relevant tables:
```
"Find tables related to job postings or employment data"
"Show me tables containing salary information"
```

### Complex Analytics
Combine multiple tools for deep analysis:
1. Use `search_catalog` to find relevant datasets
2. Use `get_table_info` to understand schema
3. Use `ask_data_insights` for natural language analysis
4. Use `execute_sql` for precise, optimized queries

## Cost Management

### Sandbox Tier Limits
- **1 TB/month free** query processing
- **10 GB storage** for user-created datasets
- **Public datasets**: Free to query (counts toward 1 TB limit)

### Cost Optimization
- Use `LIMIT` clauses during development
- Leverage partitioned tables for time-series queries
- Cache frequently accessed results
- Use `dryRun` parameter to estimate costs before execution

### Monitoring
```bash
# Check current usage
gcloud beta bigquery quota list

# Set up cost alerts in Google Cloud Console
# Navigation: Billing > Budgets & alerts
```

## Integration with Existing Stack

### Hybrid Database Strategy
- **Neon PostgreSQL**: Transactional data (users, personas, jobs, match queue)
- **BigQuery**: Analytics and public data exploration
- **Data Pipeline**: Periodic exports from Neon to BigQuery for long-term analytics

### Complementary Usage
```typescript
// Example: Use BigQuery for market insights, Neon for operations
// BigQuery: "What skills are trending in the market?"
// Neon: "Match users against available jobs based on trending skills"
```

## Development Workflow

### Local Development
1. Test queries using MCP tools before implementing in code
2. Use natural language to explore data schemas
3. Validate SQL performance before production deployment
4. Iterate quickly with AI-assisted query generation

### AI-Assisted Development
- Ask Devin to generate complex SQL queries using BigQuery context
- Use `ask_data_insights` for exploratory data analysis
- Leverage natural language search for schema discovery
- Get AI explanations of query results and insights

## Troubleshooting

### Common Issues

#### Authentication Errors
```bash
# Re-authenticate
gcloud auth application-default login

# Verify project access
gcloud projects list
```

#### Permission Denied
- Ensure BigQuery API is enabled
- Verify service account or user has BigQuery Viewer/Editor role
- Check project ID in configuration matches actual project

#### Quota Exceeded
- Check Sandbox tier usage
- Consider upgrading to paid tier for production
- Optimize queries to reduce data processed

### Testing Connection
Ask Devin to:
```
"List all datasets in my BigQuery project"
"Get information about the httparchive dataset"
```

## Security Best Practices

### Credential Management
- Never commit credentials to repository
- Use environment variables for sensitive data
- Implement proper IAM roles (minimum required permissions)
- Rotate credentials regularly

### Data Governance
- Implement dataset-level access controls
- Use table partitioning for time-series data
- Enable query caching where appropriate
- Audit query logs for unusual activity

### Production Considerations
- Use service accounts instead of user credentials
- Implement proper error handling and retry logic
- Set up monitoring and alerting
- Consider data residency requirements

## Advanced Usage

### Custom Functions
Create user-defined functions in BigQuery for complex transformations:
```sql
CREATE TEMP FUNCTION extract_skills(description STRING)
RETURNS ARRAY<STRING>
AS (
  -- Custom logic to extract skills from job descriptions
);
```

### Scheduled Queries
Set up scheduled queries for regular data updates:
- Daily job posting analysis
- Weekly skill trend reports
- Monthly market intelligence summaries

### Data Studio Integration
Connect BigQuery to Google Data Studio for visualization:
- Real-time dashboards
- Custom reports
- Stakeholder presentations

## References

- [BigQuery MCP Documentation](https://docs.cloud.google.com/bigquery/docs/pre-built-tools-with-mcp-toolbox)
- [BigQuery Sandbox](https://cloud.google.com/bigquery/docs/sandbox)
- [Public Datasets](https://cloud.google.com/bigquery/public-data)
- [HTTP Archive on BigQuery](https://httparchive.org/bigquery)
- [BigQuery Pricing](https://cloud.google.com/bigquery/pricing)

## Module B Integration Notes

This MCP integration directly supports Module B objectives:
- **Zero-cost discovery**: Leverage public datasets without infrastructure costs
- **AI-assisted analysis**: Use natural language to explore complex datasets
- **Rapid prototyping**: Test hypotheses before building custom scrapers
- **Market intelligence**: Gain insights from billions of web pages

See `docs/vectormatch-blueprint.md` Module B section for architectural integration details.
