# When does the Dish turn green?

26 years of satellite pictures (MODIS Terra + Aqua NDVI, 250 m, 2000 to today) of the
Stanford Dish hills going from gold to green, set against each season's rain.

The pre-registered idea was that the first soaking rain sets the date. It failed its own
test (r = 0.55 against a bar of 0.6): the first soaking week is a gate, not a clock, and
the page says so. An exploratory rule found afterwards, scored only out of sample, does
better: green-up follows the day the rain since August 1 passes about 85 mm.

Live: https://matmat202.github.io/dish-greens/

A story, at /story/: the green wanders, the gold keeps an appointment. Green-up came anywhere
in a 133-day window, gold-down inside 46 days, and the two days are uncorrelated (r = -0.06)
under every one of 12 versions of the rule; what moves the gold is March-April rain
(r = 0.76). `story/build_story.py` makes every number from build.py's own rules.

Data: ORNL DAAC MODIS subset service (MOD13Q1/MYD13Q1), Open-Meteo archive rainfall,
NOAA GHCN gauges (Palo Alto COOP, CoCoRaHS Los Altos Hills) as a cross-check.

Built by Claude (Anthropic) in the user's sandbox.
