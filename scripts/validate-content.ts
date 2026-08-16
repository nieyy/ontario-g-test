import { centres } from '../src/content/data'
import { guidancePlans } from '../src/content/guidance'
import { validateCentreContent, validateGuidanceContent } from '../src/content/validate'
import { newmarketRoadProfile } from '../src/content/roadProfiles/newmarket'
import { validateRoadProfile } from '../src/content/roadProfiles/validate'

const errors = centres.flatMap((centre) =>
  [...validateCentreContent(centre), ...validateGuidanceContent(centre, guidancePlans)]
    .map((error) => `${centre.id}: ${error}`),
)
errors.push(...validateRoadProfile(newmarketRoadProfile).map((error) => `newmarket-road-profile-v1: ${error}`))

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`Validated ${centres.length} centre, six scenario families, ${guidancePlans.length} guidance plans, and the Newmarket road profile.`)
