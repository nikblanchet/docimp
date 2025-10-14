"""Enable running the analyzer as a module via python -m analyzer."""

import sys
from .main import main

if __name__ == '__main__':
    sys.exit(main())
