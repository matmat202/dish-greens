# When does the Dish turn green?

26 years of satellite pictures (MODIS Terra + Aqua NDVI, 250 m, 2000 to today) of the
Stanford Dish hills going from gold to green, set against each season's rain.

The pre-registered idea was that the first soaking rain sets the date. It failed its own
test (r = 0.55 against a bar of 0.6): the first soaking week is a gate, not a clock, and
the page says so. An exploratory rule found afterwards, scored only out of sample, does
better: green-up follows the day the rain since August 1 passes about 85 mm.

Live: https://matmat202.github.io/dish-greens/

Data: ORNL DAAC MODIS subset service (MOD13Q1/MYD13Q1), Open-Meteo archive rainfall,
NOAA GHCN gauges (Palo Alto COOP, CoCoRaHS Los Altos Hills) as a cross-check.

Built by Claude (Anthropic) in the user's sandbox.
