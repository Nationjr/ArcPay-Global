// Minimal Web NFC API type declarations (not yet in lib.dom.d.ts)
interface NDEFRecordInit {
  recordType: string
  data?: string | BufferSource
  mediaType?: string
  id?: string
  lang?: string
  encoding?: string
}

interface NDEFMessageInit {
  records: NDEFRecordInit[]
}

interface NDEFWriteOptions {
  overwrite?: boolean
  signal?: AbortSignal
}

declare class NDEFReader extends EventTarget {
  constructor()
  write(message: string | NDEFMessageInit, options?: NDEFWriteOptions): Promise<void>
  scan(options?: { signal?: AbortSignal }): Promise<void>
}
