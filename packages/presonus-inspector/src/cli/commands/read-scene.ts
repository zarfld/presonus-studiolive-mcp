/**
 * `presonus-probe read-scene` command
 *
 * Lists projects and scenes stored on the mixer via the featherbear FileRequest/FileData
 * protocol.  The FD protocol supports directory listing only - scene file CONTENT is not
 * exposed over the network (the mixer returns 0 bytes for file reads).
 *
 * Fat Channel model identification must be done via the live state key
 * `opt.compmodel.value` (see probe-fat-channel command).
 *
 * @architecture #13 ARC-C-003: presonus-inspector probe CLI
 */
import type { Command } from 'commander'

export function registerReadSceneCommand(program: Command): void {
  program
    .command('read-scene')
    .description('List projects and scenes stored on the mixer.')
    .requiredOption('-d, --device <ip>', 'Target device IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .action(async (opts: { device: string; port: string }) => {
      const port = parseInt(opts.port, 10)

      console.error(`Connecting to ${opts.device}:${port}...`)

      const { Client } = await import('@featherbear/presonus-studiolive-api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })
      await client.connect()
      console.error('Connected. Waiting for state...')
      await new Promise((r) => setTimeout(r, 2000))

      try {
        const projects = await client.getProjects(false)
        if (!projects || (projects as unknown[]).length === 0) {
          console.log('No projects found on mixer.')
        } else {
          const projArr = projects as Array<{ name: string }>
          console.log(`\nProjects on mixer (${projArr.length}):`)
          for (const proj of projArr) {
            console.log(`  ${proj.name}`)
            try {
              const scenes = await client.getScenesOfProject(proj.name)
              for (const s of (scenes as Array<{ name: string }> ?? [])) {
                const isCurrent = s.name === client.currentScene ? ' <- current' : ''
                console.log(`    -- ${s.name}${isCurrent}`)
              }
            } catch {
              console.log('    -- (error retrieving scenes)')
            }
          }
          console.log(`\nCurrent project: ${String(client.currentProject ?? '(none)')}`)
          console.log(`Current scene:   ${String(client.currentScene ?? '(none)')}`)
        }

        console.log('\nNote: Scene file content (__classid) is not accessible via the')
        console.log('network API. Use probe-fat-channel for Fat Channel model identification.')
      } finally {
        await client.close?.()
      }
    })
}
