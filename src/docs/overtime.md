# Round Robin (and Swiss) Overtime Protection

Round Robin (and Swiss) pools generate a lot more sets than elimination brackets.
This can cause the playback runtime of a wave to be significantly longer than the wave actually took to run, which in turn can cause overall playback to fall significantly behind.

If enabled, Round Robin (and Swiss) Overtime Protection will lower the priority of an RR or Swiss wave queue once its playback runtime exceeds the time the wave actually took to run.

The time the wave took to run is calculated by comparing its own start time with the start time of the next known queue (as long as it was >45 minutes later).
