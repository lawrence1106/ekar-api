module.exports = {
  apps: [
    {
      name: "atsEndpoints",
      script: "./atsEndpoints.js",
      watch: true,
      exec_mode: "cluster",
    },
    {
      name: "qPublisher",
      script: "./qPublisher.js",
      watch: true,
      exec_mode: "cluster",
    },
    {
      name: "commandsConsumer",
      script: "./commandsConsumer.js",
      watch: true,
      exec_mode: "cluster",
    },
  ],
};

