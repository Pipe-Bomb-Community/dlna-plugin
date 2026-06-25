<h1>
    <img src="https://raw.githubusercontent.com/Pipe-Bomb/.github/refs/heads/master/assets/logos/Pipe%20Bomb%20no%20background%20w%20outline.png" width="40" />
    DLNA Plugin
</h1>

Makes music on Pipe Bomb available using a DLNA server.

## Installation

Clone the repo into your [Pipe Bomb server's](https://github.com/pipe-bomb/server) `plugins` directory. Then inside, run:

```bash
npm ci
npm run build
```

## Usage

This plugin uses port `1900` (UDP) to receive multicast packets from clients. It also uses a configurable TCP port for the DLNA web server. Both ports need to be allowed through the firewall in order for clients to detect and use the DLNA server.

## Contributing

Contributions are welcome. Please PR with additional or improved functionality!
