export class Device {
  constructor(doc: any, parser: any)
  id: string
  uuid: string
  name: string
  type: string
  children: Device[]
  parent: Device | null
  findDataItems(callback: (di: any) => boolean): any[]
  [key: string]: any
}
