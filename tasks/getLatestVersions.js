/* eslint-env node */
const { execSync } = require('child_process')

async function main() {
  const workspaceListJson =
    '[' +
    execSync('yarn workspaces list --json')
      .toString()
      .trim()
      .split('\n')
      .join(',') +
    ']'

  console.log({
    workspaceListJson,
  })

  const workspacePackages = JSON.parse(workspaceListJson).map(
    (workspace) => workspace.name
  )

  console.log('Found packages:', workspacePackages)

  for (const packageName of workspacePackages) {
    try {
      const packageInfoJson = execSync(`yarn npm info ${packageName} --json`, {
        encoding: 'utf-8',
      })
      const packageInfo = JSON.parse(packageInfoJson)

      if (packageInfo['dist-tags'] && packageInfo['dist-tags'].rc) {
        console.log(
          `Latest RC version for ${packageName}: ${packageInfo['dist-tags'].rc}`
        )
      } else {
        console.log(`No RC version found for ${packageName}`)
      }
    } catch (error) {
      console.error(
        `Error fetching information for ${packageName}:`,
        error.message
      )
    }
  }
}

main().catch((error) => {
  console.error('An error occurred:', error)
})
