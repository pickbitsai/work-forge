# Data and privacy

The default data directory is `workspace/`, relative to the launch directory.
All records are plain JSON or Markdown. No telemetry, database account, or cloud
storage is configured. Back up the entire directory to preserve the sources and
their citations. Files are not encrypted by the application; protect them with
your operating system's account and disk controls.

The local UI listens only on 127.0.0.1. Host and Origin checks, a per-process
request token, bounded request bodies, escaped rendering, and an explicit static
file map protect the normal browser workflow. This does not defend against other
software already running as your operating-system user. Do not expose the server
through a tunnel or a public network interface.

PDFs and DOCX files are parsed locally by PDF.js and Mammoth. Empty/image-only PDFs
produce an actionable error; this version does not run OCR. Legacy `.doc` and ZIP
archives are not parsed. Download or export your LinkedIn information yourself,
extract ZIP archives, and import the relevant text-bearing files. Pasting a URL
records provenance but does not fetch a logged-in LinkedIn profile.

GitHub reads use public REST endpoints without credentials. A username lists public
repositories; only selected repositories are imported, including their metadata
and README. Forks are labeled. Missing READMEs and rate-limit errors are reported.
Repository ownership and skill tags do not establish authorship, seniority, or
production experience. Private GitHub repositories can be represented by local
files selected by their owner.

Local project scans collect at most 60 eligible files / 180 KB, with a 30 KB per-file
limit. Git repositories use `git ls-files` to respect ignore rules. Outside Git,
only top-level documentation, manifests, and documentation folders are scanned.
Hidden files, dependencies, build output, binary files, and symlinks are skipped.
These filters are not a secret detector. Review selected source code and documents
before placing them in an agent packet. Copying files into the evidence library
does not transmit them to a model.

Browser dictation is opt-in. Depending on the browser, recognition can send audio
to its speech service. Work Forge saves only the transcript you review and submit,
not an audio recording. For stricter local processing, use your OS's on-device
dictation or a local transcription tool and paste the transcript.

The agent adapter inherits its process environment and existing login. Work Forge
does not collect API keys. A cloud agent may transmit the entire packet to its
provider. Keep task folders private and review their contents before running them.
Agent output is always untrusted until validated and owner-reviewed.

To remove personal data, stop Work Forge, back up anything you want to retain, and
delete the named workspace directory using your operating system. Release archives
use an allowlist, so personal workspaces are excluded even if they contain files
that Git has accidentally tracked. Do not use the public project repo as your
private data backup.
