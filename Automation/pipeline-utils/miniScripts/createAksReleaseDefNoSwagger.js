const automation = require('../../npm-cli/cli.js')
const azRest = require('../../npm-cli/azRest/azRest.js')
const args = require('args')
const _ = require('underscore')
const sleep = require('sleep-promise');

let serviceName, healthCheckPathLiveness, healthCheckPathReadiness, repoName
args.options([
  {
    name: 'name',
    description: 'service name',
    init: arg => serviceName = arg,
    defaultValue: '$(Release.DefinitionName)',
  },
  {
    name: 'repoName',
    description: 'repo name by default will use same value as whatever the service name is',
    init: arg => repoName = arg,
  },
  {
    name: 'livenessProbePath',
    description: 'health check path',
    init: arg => healthCheckPathLiveness = arg,
  },
  {
    name: 'readinessProbePath',
    description: 'health check path for rediness defaults to same path as liveness probe',
    init: arg => healthCheckPathReadiness = arg,
  }
])

const flags = args.parse(process.argv) //needed for cli to be read

async function run()
{
  if (!healthCheckPathReadiness) healthCheckPathReadiness = healthCheckPathLiveness
  if (!repoName) repoName = serviceName
  //figure out which branch the artifact should be set to
  let latestBranch;
  let branches = await automation.getBranchesJSON(repoName)
  let branchNames = _.pluck(branches, 'name')
  for (const branchName of branchNames) if (branchName.toLowerCase() == 'release_aks') latestBranch = branchName;
  if (!latestBranch)
  {
    latestBranch = await automation.getLatestReleaseBranch(repoName)
    if (latestBranch) latestBranch = latestBranch.name
  }
  if (latestBranch == null) latestBranch = undefined

  console.log('Detected latest release branch: ' + latestBranch)
  await azRest.cloneReleaseDef(azRest.PATH_TEMPLATE_AKS, 'AKS template No Swagger', azRest.PATH_AKS, serviceName, serviceName, true, latestBranch)
  await sleep(5000) //was getting issue with not all variables being updated with only sleep 2000
  let response = await azRest.updateServiceVariables(serviceName, azRest.PATH_AKS, [
    { scope: "Release", name: "gitOwnerRepo", value: "$(Build.Repository.Name)" },
    { scope: "Release", name: "serviceName", value: serviceName },
    { scope: "Release", name: "healthCheckPathLiveness", value: healthCheckPathLiveness },
    { scope: "Release", name: "healthCheckPathReadiness", value: healthCheckPathReadiness },
  ])
  console.log(response);
  console.log('Waiting a bit before next step')
  await sleep(3000)
  await azRest.updateTriggersForService(serviceName, 'Release_*', azRest.PATH_AKS)
  await sleep(1000)

}
run();
