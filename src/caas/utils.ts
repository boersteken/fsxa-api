import {
  CAASPageRef,
  Page,
  CAASPageBody,
  Body,
  CAASPageSection,
  Section,
  ObjectMap,
  CAASDataEntry,
  CAASDatasetReference,
  CAASPageBodyContent,
  DatasetReference,
  BodyContent
} from './types'

export const mapDataEntryValue = async (
  entry: CAASDataEntry,
  locale: string,
  apiKey: string
): Promise<any> => {
  switch (entry.fsType) {
    case 'CMS_INPUT_NUMBER':
    case 'CMS_INPUT_DOM':
    case 'CMS_INPUT_TEXT':
    case 'CMS_INPUT_TEXTAREA':
    case 'CMS_INPUT_DATE':
    case 'FS_MARKDOWN':
      return entry.value
    case 'CMS_INPUT_LINK':
      if (!entry.value) return null
      const data = await mapDataEntries(entry.value.formData, locale, apiKey)
      return {
        layout: entry.value.template.uid,
        data
      }
    case 'CMS_INPUT_COMBOBOX':
      return entry.value
    case 'CMS_INPUT_TOGGLE':
      return entry.value || false
    case 'FS_DATASET':
      if (!entry.value) return null
      return {
        schema: entry.value.target.schema,
        identifier: entry.value.target.identifier,
        type: entry.value.target.entityType,
        url: entry.value.url
      }
    case 'FS_REFERENCE':
      if (!entry.value) return null
      if (entry.value.fsType === 'Media') {
        // fetch media
        const response = await fetch(entry.value.url, {
          headers: getAxiosHeaders(apiKey)
        })
        const data = await response.json()
        return {
          identifier: data.identifier,
          previewId: entry.value.previewId,
          resolutions: data.resolutionsMetaData
        }
      }
      return {
        referenceType: entry.value.fsType,
        referenceId: entry.value.identifier,
        previewId: entry.value.previewId,
        uid: entry.value.uid,
        src: entry.value.url
      }
    case 'FS_CATALOG':
      if (!entry.value) return []
      return Promise.all(
        entry.value.map(async value => {
          const data = await mapDataEntries(value.formData, locale, apiKey)
          return {
            previewId: [value.identifier, locale].join('.'),
            identifier: value.identifier,
            data
          }
        })
      )
    case 'FS_INDEX':
      switch (entry.dapType) {
        case 'FirstSpiritFragmentAccess/FSFAConnector':
          return {
            type: 'fragments',
            value: (entry.value || []).map(value => {
              const parsedJSON = JSON.parse(value.identifier)
              return {
                type: 'Fragment',
                id: parsedJSON.fid,
                remote: parsedJSON.remote
              }
            })
          }
        case 'FirstSpiritMediaAccess/Connector':
          return {
            type: 'fragments',
            value: (entry.value || []).map(value => {
              const parsedJSON = JSON.parse(value.identifier)
              return {
                type: 'Fragment',
                id: parsedJSON.uid,
                remote: parsedJSON.remote
              }
            })
          }
        default:
          return entry
      }
    default:
      // console.log("Could not map value", entry);
      return entry
  }
}

export const mapDataEntries = async (
  entries: ObjectMap<CAASDataEntry>,
  locale: string,
  apiKey: string
): Promise<ObjectMap<any>> => {
  const keys = Object.keys(entries || {})
  const result: ObjectMap<any> = {}
  const results = await Promise.all(
    keys.map(key => mapDataEntryValue(entries[key], locale, apiKey))
  )
  keys.forEach((key, index) => (result[key] = results[index]))
  return result
}

export const mapDatasetReference = async (
  reference: CAASDatasetReference,
  locale: string
): Promise<DatasetReference> => {
  return {
    id: reference.target.identifier,
    previewId: [reference.target.identifier, locale].join('.'),
    type: 'DatasetReference',
    entityType: reference.target.entityType,
    schema: reference.target.schema
  }
}

export const mapPageSection = async (
  section: CAASPageSection,
  locale: string,
  apiKey: string
): Promise<Section> => {
  const [data, meta] = await Promise.all([
    mapDataEntries(section.formData, locale, apiKey),
    mapDataEntries(section.metaFormData, locale, apiKey)
  ])
  return {
    id: section.identifier,
    type: 'Section',
    previewId: [section.identifier, locale].join('.'),
    sectionType: section.template.uid,
    data,
    meta
  }
}

export const mapPageContent = async (
  content: CAASPageBodyContent,
  locale: string,
  apiKey: string
): Promise<BodyContent | null> => {
  switch (content.fsType) {
    case 'DatasetReference':
      return mapDatasetReference(content, locale)
    case 'Section':
      return mapPageSection(content, locale, apiKey)
    default:
      return null
  }
}

export const mapPageBody = async (
  body: CAASPageBody,
  locale: string,
  apiKey: string
): Promise<Body> => {
  const children: BodyContent[] = (
    await Promise.all(
      body.children.map(async child => {
        const mappedResult = await mapPageContent(child, locale, apiKey)
        return mappedResult || null
      })
    )
  ).filter(child => child) as BodyContent[]
  return {
    name: body.name,
    previewId: [body.identifier, locale].join('.'),
    children
  }
}

export const mapPage = async (
  pageRef: CAASPageRef,
  locale: string,
  apiKey: string
): Promise<Page> => {
  const [data, meta, children] = await Promise.all([
    mapDataEntries(pageRef.page.formData, locale, apiKey),
    mapDataEntries(pageRef.page.metaFormData, locale, apiKey),
    Promise.all(pageRef.page.children.map(child => mapPageBody(child, locale, apiKey)))
  ])
  return {
    id: pageRef.page.identifier,
    refId: pageRef.identifier,
    previewId: [pageRef.page.identifier, locale].join('.'),
    name: pageRef.page.name,
    displayName: pageRef.page.displayName,
    layout: pageRef.page.template.uid,
    children,
    data,
    meta
  }
}

export const getAxiosHeaders = (apiKey: string): {} => {
  return {
    Authorization: `apikey="${apiKey}"`
  }
}
