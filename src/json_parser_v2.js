import * as JSONPath from "jsonpath-plus"

class ProtocolError extends Error {}

class JsonParserV2 {
  devices(probe, fun) {
    const devices = JSONPath.JSONPath({
      path: "$..Devices.Device.*",
      json: probe,
    })
    console.debug(devices)
    return devices.map(fun)
  }

  components(doc, fun) {
    const obj = doc.Components
    if (obj) {
      const components = Object.keys(obj).flatMap((k) => {
        return obj[k].map((v) => fun(k, v))
      })
      return components
    }
    return []
  }

  dataItems(doc, fun) {
    const obj = doc.DataItems
    if (obj) {
      const items = obj.DataItem.map((v) => {
        return fun(v)
      })
      return items
    }
    return null
  }

  componentRelationships(doc, fun) {
    if (doc.ComponentRelationship) {
      return doc.ComponentRelationship.map(fun)
    }
    return []
  }

  coordinateSystems(doc, fun) {
    if (doc.CoordinateSystem) {
      return doc.CoordinateSystem.map(fun)
    }
    return []
  }

  observations(data, fun) {
    const values = JSONPath.JSONPath({
      path: "$..ComponentStream.[Events,Samples,Condition]",
      json: data,
    })
    values.forEach((v) => {
      Object.entries(v).forEach((n) => {
        n[1].forEach((t) => fun(n[0], t))
      })
    })
  }
}

export { JsonParserV2 }
